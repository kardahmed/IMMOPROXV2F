// ai-assistant — X Assistant Phase 2: Q&A + actions via Claude tool use.
//
// Phase 1 was read-only ("Combien de visites cette semaine ?"). Phase 2
// adds 5 tools so X can also DO things on the agent's behalf:
//   - search_clients       (helper — find a client by fuzzy name/phone)
//   - create_client        (new lead in pipeline_stage='accueil')
//   - create_visit         (planned visit on an existing client)
//   - create_task          (reminder/follow-up)
//   - update_client_stage  (move along the 9-stage pipeline)
//
// Flow per call:
//   1. Auth + plan feature gate (x_assistant_qa) + per-tenant Anthropic quota
//   2. Build tenant context blob (agents, projects, top 50 clients, etc.)
//   3. Loop with Claude Haiku 4.5 (max 5 iterations):
//        a. POST /v1/messages with `tools` and full conversation
//        b. If stop_reason === 'tool_use' → execute every tool_use block
//           via tenant-scoped Supabase calls, append tool_result, loop.
//        c. If stop_reason === 'end_turn' → return final text to caller.
//   4. Persist the interaction (input + final response + tool calls + cost
//      + duration) in x_interactions for super-admin audit.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkPlanFeature } from '../_shared/checkPlanFeature.ts'
import { trackAnthropicCost } from '../_shared/trackCost.ts'
import { checkQuota, quotaErrorResponse } from '../_shared/checkQuota.ts'
import { sanitizeForPrompt, wrapUntrusted } from '../_shared/promptSanitize.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Tool definitions ────────────────────────────────────────────────
// Schema mirrors the actual table columns (see migrations 001 + 028).
// Enum values must match the CHECK constraints exactly — wrong values
// crash the INSERT and the agent has to recover via the tool_result error.

const TOOLS = [
  {
    name: 'search_clients',
    description: "Recherche un client existant par nom partiel ou téléphone. Utilise cet outil quand l'utilisateur mentionne un client par son nom et que tu as besoin de son client_id pour une autre action (visite, tâche, changement d'étape).",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nom partiel ou numéro de téléphone' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_client',
    description: "Crée un nouveau client (lead) dans le pipeline. Étape initiale = 'accueil'. Si le téléphone manque, demande-le AVANT d'appeler cet outil.",
    input_schema: {
      type: 'object',
      properties: {
        full_name: { type: 'string', description: 'Nom complet du client' },
        phone: { type: 'string', description: "Téléphone (format algérien: 05XX XX XX XX)" },
        source: {
          type: 'string',
          enum: ['facebook_ads', 'google_ads', 'instagram_ads', 'appel_entrant', 'reception', 'bouche_a_oreille', 'reference_client', 'site_web', 'portail_immobilier', 'autre'],
          description: "Source du lead. Si l'utilisateur ne précise pas, mets 'autre'.",
        },
        confirmed_budget: { type: 'number', description: 'Budget confirmé en DA (optionnel)' },
      },
      required: ['full_name', 'phone', 'source'],
    },
  },
  {
    name: 'create_visit',
    description: "Programme une visite pour un client existant. Tu DOIS avoir le client_id avant — appelle search_clients d'abord si besoin.",
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client (depuis search_clients ou contexte)' },
        scheduled_at: { type: 'string', description: "Date+heure ISO 8601 (ex: '2026-06-10T10:00:00'). Convertis 'le 10 juin à 10h', 'demain', 'lundi prochain' à partir de la DATE DU JOUR du contexte." },
        visit_type: {
          type: 'string',
          enum: ['on_site', 'office', 'virtual'],
          description: "'on_site' = au projet, 'office' = au bureau, 'virtual' = visioconférence",
        },
      },
      required: ['client_id', 'scheduled_at', 'visit_type'],
    },
  },
  {
    name: 'create_task',
    description: "Crée une tâche (rappel/suivi) pour un client existant. Tu DOIS avoir le client_id avant.",
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client' },
        title: { type: 'string', description: 'Description courte de la tâche' },
        due_at: { type: 'string', description: "Date d'échéance ISO 8601 (optionnel)" },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Priorité (défaut: medium)',
        },
      },
      required: ['client_id', 'title'],
    },
  },
  {
    name: 'update_client_stage',
    description: "Change l'étape pipeline d'un client. Utilise cet outil quand l'utilisateur dit 'passe X en négociation', 'marque Y comme perdu', etc.",
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client' },
        new_stage: {
          type: 'string',
          enum: ['accueil', 'visite_a_gerer', 'visite_confirmee', 'visite_terminee', 'negociation', 'reservation', 'vente', 'relancement', 'perdue'],
          description: 'Nouvelle étape',
        },
      },
      required: ['client_id', 'new_stage'],
    },
  },
  {
    name: 'update_client_info',
    description: "Met à jour les infos d'un client existant : budget confirmé, agent assigné, priorité. Tous les champs sont optionnels — ne passe que ceux que l'utilisateur veut changer.",
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client' },
        confirmed_budget: { type: 'number', description: 'Nouveau budget en DA (optionnel)' },
        agent_id: { type: 'string', description: "UUID du nouvel agent (depuis le contexte AGENTS) (optionnel)" },
        is_priority: { type: 'boolean', description: 'Marquer/démarquer prioritaire (optionnel)' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'mark_visit_completed',
    description: "Marque une visite comme terminée. À utiliser après une visite réelle pour enregistrer le résultat.",
    input_schema: {
      type: 'object',
      properties: {
        visit_id: { type: 'string', description: 'UUID de la visite (depuis le contexte VISITES)' },
        outcome: {
          type: 'string',
          enum: ['interested', 'not_interested', 'rescheduled', 'no_show'],
          description: "'interested' = intéressé, 'not_interested' = pas intéressé, 'rescheduled' = à reprogrammer, 'no_show' = ne s'est pas présenté",
        },
        notes: { type: 'string', description: 'Résumé court de la visite (optionnel mais recommandé)' },
      },
      required: ['visit_id', 'outcome'],
    },
  },
  {
    name: 'send_whatsapp',
    description: "Envoie un message WhatsApp au client via l'API Meta. Le message libre n'est possible que si le client a écrit dans les 24h dernières — sinon utilise un template.",
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client' },
        message: { type: 'string', description: "Texte du message (le système ajoutera le contexte agence)" },
      },
      required: ['client_id', 'message'],
    },
  },
] as const

const SYSTEM_PROMPT_FR = `Tu es X, l'assistant IA d'IMMO PRO-X (CRM immobilier algérien). Tu réponds aux questions de l'agent immobilier ET tu peux exécuter des actions via les outils fournis.

OUTILS DISPONIBLES :
- search_clients : trouver un client par nom/téléphone (utilise-le pour récupérer un client_id)
- create_client : créer un nouveau lead dans le pipeline
- create_visit : programmer une visite pour un client (nécessite client_id)
- create_task : créer une tâche/rappel pour un client (nécessite client_id)
- update_client_stage : changer l'étape pipeline d'un client
- update_client_info : changer budget / agent / priorité d'un client
- mark_visit_completed : marquer une visite comme terminée avec son issue
- send_whatsapp : envoyer un message WhatsApp à un client

QUAND UTILISER LES OUTILS :
- L'utilisateur dit "crée", "ajoute", "programme", "passe en", "marque comme" → utilise un outil
- Pour create_visit / create_task / update_client_stage : si tu n'as pas le client_id, appelle search_clients D'ABORD
- Si une info obligatoire manque (ex: téléphone pour create_client), DEMANDE-LA avant d'agir
- Si le client n'existe pas (search_clients renvoie vide), dis-le et propose de le créer

TOLÉRANCE VOIX (les inputs viennent souvent de dictée — sois tolérant) :
- Fautes phonétiques courantes : "popline" = "pipeline", "accueille" = "accueil", "déni"/"négo" = "négociation", "siège" = "bureau"
- Verbes parasites avant une valeur : "passer X", "mets X", "c'est X", "ouais X", "ben X", "alors X" → la valeur est X (ignore le verbe avant)
- Réponses très courtes (1-5 mots) = quasi toujours une réponse à TA dernière question, JAMAIS une nouvelle demande

CONTINUITÉ DE CONVERSATION (CRITIQUE) :
Si dans le tour PRÉCÉDENT tu as posé une question pour compléter une action, le message SUIVANT de l'utilisateur EST la réponse à cette question. Tu DOIS :
1. Te souvenir de l'action en cours (créer client / créer visite / créer tâche / changer étape)
2. Mapper la réponse de l'utilisateur à la valeur d'enum correspondante (voir tables ci-dessous)
3. Appeler le bon outil immédiatement — NE redemande PAS, NE propose PAS d'autres options

MAPPING SOURCE (pour create_client) — quand tu as demandé la source :
- "Google", "Google ads", "passer Google", "c'est Google" → source='google_ads'
- "Facebook", "FB", "Meta", "passer Facebook" → source='facebook_ads'
- "Instagram", "Insta", "IG" → source='instagram_ads'
- "appel", "téléphone", "appel entrant", "il a appelé" → source='appel_entrant'
- "bouche à oreille", "BAO", "ami", "recommandation" → source='bouche_a_oreille'
- "client recommandé", "ancien client", "référence" → source='reference_client'
- "site", "site web", "notre site" → source='site_web'
- "portail", "Ouedkniss", "Wakaa", "Algerimo" → source='portail_immobilier'
- "réception", "agence", "passé en bureau", "walk-in" → source='reception'
- "autre", "je sais pas", "sais pas" → source='autre'

MAPPING TYPE DE VISITE (pour create_visit) — quand tu as demandé le type :
- "site", "sur site", "au projet", "sur place" → visit_type='on_site'
- "bureau", "agence", "siège", "au bureau" → visit_type='office'
- "visio", "virtuel", "en ligne", "Zoom", "Meet", "WhatsApp" → visit_type='virtual'

MAPPING PRIORITÉ TÂCHE (pour create_task) :
- "urgent", "vite", "tout de suite" → 'urgent'
- "important", "haute", "élevée" → 'high'
- "normal", "moyen", "moyenne" → 'medium' (défaut si non précisé)
- "bas", "faible", "pas pressé" → 'low'

MAPPING ÉTAPE PIPELINE (pour update_client_stage) :
- "accueil", "départ" → 'accueil'
- "à gérer", "à confirmer" → 'visite_a_gerer'
- "confirmée", "validée" → 'visite_confirmee'
- "terminée", "fini la visite" → 'visite_terminee'
- "négo", "négociation" → 'negociation'
- "réservation", "réservé" → 'reservation'
- "vente", "vendu", "signé" → 'vente'
- "relance", "relancement" → 'relancement'
- "perdu", "perdue", "abandonné" → 'perdue'

EXEMPLE CRITIQUE (ton dernier bug) :
- Tour précédent (toi): "Quelle est la source ? Facebook, Google, appel entrant, bouche à oreille, autre ?"
- Maintenant (user): "passer Google"
- Toi (CORRECT): [create_client(full_name='Mohamed Benassar', phone='05 18 29 49 50', source='google_ads')] "Client Mohamed Benassar créé, source Google Ads."
- Toi (INTERDIT): "Je ne comprends pas..."

RECHERCHE vs CRÉATION (heuristique) :
Si après un search_clients infructueux, l'utilisateur fournit un NOM + TÉLÉPHONE neuf, c'est une CRÉATION → demande la source manquante puis appelle create_client.
Si l'utilisateur fournit juste un NOM différent sans téléphone, c'est une CORRECTION → re-cherche avec ce nouveau nom.

RÈGLES DE RÉPONSE (CRITIQUE — RESPECTE STRICTEMENT) :
- 1 PHRASE MAX par réponse (max 20 mots). Pour la voix, plus court = mieux.
- Pas de listes, pas de markdown, pas d'emojis, pas de "Bien sûr"/"D'accord"/"Voici"
- Tutoie l'agent
- Après une action réussie : nomme l'action + les détails essentiels en 1 phrase ("Client Mohamed créé." / "Visite Hasna 22 juin programmée." / "Étape passée en négo.")
- Si une action échoue : 1 phrase qui dit pourquoi, sans excuses
- Pour les questions read-only : réponds avec les chiffres/faits, sans périphrase
- Si l'info manque, demande UNIQUEMENT ce qui manque (ex: "Source ?"), pas un menu

ACTIONS DESTRUCTIVES — DEMANDE TOUJOURS CONFIRMATION :
Pour delete_*, update_client_stage='perdue', mark_visit_completed='no_show' → demande confirmation explicite AVANT d'appeler l'outil :
- Tour 1 (user): "Supprime Hasna"
- Tour 1 (toi): "Confirmer la suppression de Hasna Bouzid ?"  ← PAS d'outil ici
- Tour 2 (user): "oui" / "ok" / "confirme"
- Tour 2 (toi): [appelle l'outil] "Hasna supprimée."

FORMATS :
- Montants en DA avec espaces (12 500 000 DA)
- Dates en français à l'oral (15 juin), ISO 8601 dans les outils (2026-06-15T10:00:00)
- Réponds dans la langue de la question (français ou arabe)`

const SYSTEM_PROMPT_AR = `أنت X، المساعد الذكي لـ IMMO PRO-X. تجيب على الأسئلة وتنفذ الإجراءات عبر الأدوات المتوفرة.

الأدوات المتاحة :
- search_clients : البحث عن عميل بالاسم أو الهاتف
- create_client : إنشاء عميل جديد (lead)
- create_visit : برمجة زيارة لعميل موجود (تحتاج client_id)
- create_task : إنشاء مهمة/تذكير لعميل
- update_client_stage : تغيير مرحلة العميل في خط المبيعات

متى تستخدم الأدوات :
- المستخدم يقول "أنشئ"، "أضف"، "برمج"، "انقل إلى"، "علّم كـ" → استخدم أداة
- لـ create_visit / create_task / update_client_stage : إذا لم يكن لديك client_id، استدع search_clients أولاً
- إذا كانت معلومة إلزامية ناقصة (مثلاً الهاتف لـ create_client)، اطلبها قبل التنفيذ
- إذا لم يوجد العميل، قل ذلك واقترح إنشاءه

استمرارية المحادثة (مهم جداً) :
إذا كنت في الدور السابق قد طرحت سؤالاً لإكمال إجراء (مثلاً "ما نوع الزيارة؟"، "ما رقم الهاتف؟")، فإن رسالة المستخدم التالية هي إجابة على ذلك السؤال. عليك :
1. تذكُّر الإجراء قيد التنفيذ
2. دمج المعلومات السابقة مع الإجابة الجديدة
3. استدعاء الأداة المناسبة فوراً — لا تطرح السؤال مجدداً، ولا تقترح خيارات أخرى

قواعد الرد :
- أجب بـ 1 إلى 3 جمل قصيرة، جاهزة للصوت
- بدون markdown، بدون رموز تعبيرية
- خاطب الوكيل بصيغة المخاطب
- بعد إجراء ناجح، أكّد ما فعلته بالتفاصيل
- إذا فشل إجراء، اشرح السبب في جملة واحدة
- للأسئلة (قراءة فقط) : اعتمد فقط على بيانات السياق

التنسيق :
- المبالغ بالدينار الجزائري بمسافات (12 500 000 دج)
- التواريخ في معاملات الأدوات بصيغة ISO 8601`

// ─── Tool execution ──────────────────────────────────────────────────
// Every tool runs with the service role client but is manually scoped
// to the calling tenant + agent — RLS doesn't help us here because we
// authenticated with the service role bypass. tenant_id is appended on
// every INSERT and matched on every UPDATE/SELECT.
//
// Tools mirror the side-effects the React UI fires alongside its raw
// INSERTs/UPDATEs. The helpers below replicate (not rebuild) the
// exact behavior of the corresponding frontend code path so X's
// actions land identically to a hand-typed UI action — same history
// rows, same client.notes mirror, same last_contact_at bump, same
// auto-task generation when stage moves. Otherwise X creates "ghost"
// records that bypass the audit trail and leave the platform in an
// inconsistent state.

interface ToolResult {
  result: string
  is_error: boolean
}

// Mirrors src/lib/clientNotes.ts — prepend a timestamped block to
// clients.notes so the Notes tab shows what X did.
async function _appendClientNote(
  supabase: SupabaseClient,
  clientId: string | null | undefined,
  header: string,
  body: string | null | undefined,
): Promise<void> {
  if (!clientId) return
  const { data: row } = await supabase.from('clients').select('notes').eq('id', clientId).single()
  const existing = (row as { notes?: string | null } | null)?.notes ?? ''
  const stamp = new Date().toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const cleaned = (body ?? '').trim()
  const block = `─── ${stamp} — ${header} ───\n${cleaned || '(aucune note)'}\n`
  const next = existing ? `${block}\n${existing}` : block
  await supabase.from('clients').update({ notes: next }).eq('id', clientId)
}

// Inserts an audit row in `history` so the client detail timeline
// reflects the action. Matches the shape used by PlanVisitModal,
// TaskDetailModal, etc.
async function _insertHistory(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  agentId: string,
  type: string,
  title: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await supabase.from('history').insert({
    tenant_id: tenantId,
    client_id: clientId,
    agent_id: agentId,
    type,
    title,
    metadata: metadata ?? null,
  })
}

// Mirrors useAutoTasks.generateForStage from src/hooks/useAutoTasks.ts.
// When a client's pipeline_stage changes, we cancel pending tasks from
// the old stage (status=ignored, auto_cancelled=true) and spawn fresh
// tasks from the templates configured for the new stage.
async function _generateTasksForStage(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  agentId: string,
  newStage: string,
  oldStage: string | null,
): Promise<void> {
  if (oldStage && oldStage !== newStage) {
    await supabase.from('tasks')
      .update({ status: 'ignored', auto_cancelled: true })
      .eq('client_id', clientId)
      .eq('stage', oldStage)
      .eq('status', 'pending')
  }
  const { count } = await supabase.from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('stage', newStage)
    .or('status.neq.ignored,auto_cancelled.eq.false')
  if ((count ?? 0) > 0) return
  const { data: templates } = await supabase.from('task_templates')
    .select('id, title, stage, channel, delay_minutes, priority, bundle_id')
    .eq('tenant_id', tenantId)
    .eq('stage', newStage)
    .eq('is_active', true)
    .order('sort_order')
  if (!templates || templates.length === 0) return
  type Tmpl = { id: string; title: string; stage: string; channel: string; delay_minutes: number; priority: string; bundle_id: string | null }
  const newTasks = (templates as Tmpl[]).map(t => ({
    tenant_id: tenantId,
    client_id: clientId,
    template_id: t.id,
    bundle_id: t.bundle_id,
    title: t.title,
    stage: t.stage,
    type: 'manual',
    status: 'pending',
    priority: t.priority,
    channel: t.channel,
    agent_id: agentId,
    scheduled_at: t.delay_minutes > 0 ? new Date(Date.now() + t.delay_minutes * 60000).toISOString() : null,
  }))
  await supabase.from('tasks').insert(newTasks)
}

async function _updateLastContact(supabase: SupabaseClient, clientId: string): Promise<void> {
  await supabase.from('clients').update({ last_contact_at: new Date().toISOString() }).eq('id', clientId)
}

async function executeTool(
  supabase: SupabaseClient,
  tenantId: string,
  agentId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    if (toolName === 'search_clients') {
      const query = String(input.query ?? '').trim()
      if (!query) return { result: 'Erreur: query vide', is_error: true }
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, phone, pipeline_stage')
        .eq('tenant_id', tenantId)
        .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
        .limit(5)
      if (error) return { result: `Erreur SQL: ${error.message}`, is_error: true }
      if (!data || data.length === 0) return { result: 'Aucun client trouvé.', is_error: false }
      const lines = data.map(c => `- id=${c.id} | ${c.full_name} | ${c.phone} | étape: ${c.pipeline_stage}`).join('\n')
      return { result: `${data.length} résultat(s):\n${lines}`, is_error: false }
    }

    if (toolName === 'create_client') {
      const payload = {
        tenant_id: tenantId,
        full_name: String(input.full_name ?? '').trim(),
        phone: String(input.phone ?? '').trim(),
        source: String(input.source ?? 'autre'),
        pipeline_stage: 'accueil',
        agent_id: agentId,
        confirmed_budget: typeof input.confirmed_budget === 'number' ? input.confirmed_budget : null,
      }
      if (!payload.full_name || !payload.phone) {
        return { result: 'Erreur: full_name et phone obligatoires', is_error: true }
      }
      const { data, error } = await supabase.from('clients').insert(payload).select('id').single()
      if (error) return { result: `Erreur création client: ${error.message}`, is_error: true }

      const newClientId = (data as { id: string }).id

      // Initial note so the Notes tab has a creation marker (the
      // history trigger logs the row separately).
      await _appendClientNote(supabase, newClientId,
        `🆕 Lead créé (X)`,
        `Source: ${payload.source}${payload.confirmed_budget ? ` | Budget: ${payload.confirmed_budget.toLocaleString('fr-FR')} DA` : ''}`,
      )

      // Spawn the templated tasks for the 'accueil' stage so the agent
      // gets the same auto-tasks they'd get from a UI-created lead.
      await _generateTasksForStage(supabase, tenantId, newClientId, agentId, 'accueil', null)

      return { result: `Client créé. id=${newClientId}`, is_error: false }
    }

    if (toolName === 'create_visit') {
      // Mirrors PlanVisitModal.handleSubmit (src/pages/pipeline/components/modals/PlanVisitModal.tsx).
      // 4 side-effects: insert visit → advance client stage if 'accueil' →
      // history entry → mirror in clients.notes.
      const clientId = String(input.client_id ?? '')
      const scheduledAt = String(input.scheduled_at ?? '')
      const visitType = String(input.visit_type ?? 'on_site')
      if (!clientId || !scheduledAt) {
        return { result: 'Erreur: client_id et scheduled_at obligatoires', is_error: true }
      }

      // 1. Insert visit
      const { data: visit, error } = await supabase.from('visits').insert({
        tenant_id: tenantId,
        client_id: clientId,
        agent_id: agentId,
        scheduled_at: scheduledAt,
        visit_type: visitType,
        status: 'planned',
      }).select('id').single()
      if (error) return { result: `Erreur création visite: ${error.message}`, is_error: true }

      // 2. Advance client stage from 'accueil' to 'visite_a_gerer' if applicable
      const { data: clientRow } = await supabase.from('clients').select('pipeline_stage').eq('id', clientId).single()
      const currentStage = (clientRow as { pipeline_stage: string } | null)?.pipeline_stage
      if (currentStage === 'accueil') {
        await supabase.from('clients').update({ pipeline_stage: 'visite_a_gerer' }).eq('id', clientId)
        await _generateTasksForStage(supabase, tenantId, clientId, agentId, 'visite_a_gerer', 'accueil')
      }

      // 3. History entry
      const dateStr = new Date(scheduledAt).toLocaleDateString('fr-FR')
      const timeStr = new Date(scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      await _insertHistory(supabase, tenantId, clientId, agentId, 'visit_planned',
        `Visite programmée le ${dateStr} à ${timeStr}`,
        { visit_type: visitType, scheduled_at: scheduledAt },
      )

      // 4. Mirror in clients.notes
      await _appendClientNote(supabase, clientId,
        `📅 Visite ${visitType} programmée — ${dateStr} ${timeStr}`,
        `Programmée par X (assistant IA)`,
      )

      return { result: `Visite créée. id=${(visit as { id: string }).id}`, is_error: false }
    }

    if (toolName === 'create_task') {
      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        client_id: String(input.client_id ?? ''),
        agent_id: agentId,
        title: String(input.title ?? '').trim(),
        status: 'pending',
        priority: String(input.priority ?? 'medium'),
      }
      if (input.due_at) payload.due_at = String(input.due_at)
      if (!payload.client_id || !payload.title) {
        return { result: 'Erreur: client_id et title obligatoires', is_error: true }
      }
      const { data, error } = await supabase.from('tasks').insert(payload).select('id').single()
      if (error) return { result: `Erreur création tâche: ${error.message}`, is_error: true }
      return { result: `Tâche créée. id=${(data as { id: string }).id}`, is_error: false }
    }

    if (toolName === 'update_client_stage') {
      // Mirrors PipelinePage / SmartStageDialog stage-move flow + the
      // useAutoTasks.generateForStage hook (src/hooks/useAutoTasks.ts).
      // The Postgres triggers (log_stage_change, clients_stage_changed_at_trg)
      // fire automatically on the UPDATE — but template-driven task
      // creation lives in JS, so we replicate it here.
      const clientId = String(input.client_id ?? '')
      const newStage = String(input.new_stage ?? '')
      if (!clientId || !newStage) return { result: 'Erreur: client_id et new_stage obligatoires', is_error: true }

      // 1. Capture old stage for the auto-task delta
      const { data: before } = await supabase.from('clients').select('pipeline_stage').eq('tenant_id', tenantId).eq('id', clientId).single()
      const oldStage = (before as { pipeline_stage: string } | null)?.pipeline_stage ?? null

      // 2. Update — triggers log to history + bump pipeline_stage_changed_at
      const { error } = await supabase
        .from('clients')
        .update({ pipeline_stage: newStage })
        .eq('tenant_id', tenantId)
        .eq('id', clientId)
      if (error) return { result: `Erreur SQL: ${error.message}`, is_error: true }

      // 3. Generate templated tasks for the new stage (and cancel old-stage pending ones)
      await _generateTasksForStage(supabase, tenantId, clientId, agentId, newStage, oldStage)

      // 4. Mirror in clients.notes so the change is visible in the Notes tab
      await _appendClientNote(supabase, clientId,
        `🎯 Étape changée → ${newStage}`,
        oldStage ? `De '${oldStage}' vers '${newStage}' par X` : `Vers '${newStage}' par X`,
      )

      return { result: `Étape changée vers '${newStage}'`, is_error: false }
    }

    if (toolName === 'update_client_info') {
      const clientId = String(input.client_id ?? '')
      if (!clientId) return { result: 'Erreur: client_id obligatoire', is_error: true }
      const patch: Record<string, unknown> = {}
      const changes: string[] = []
      if (typeof input.confirmed_budget === 'number') {
        patch.confirmed_budget = input.confirmed_budget
        changes.push(`budget → ${input.confirmed_budget.toLocaleString('fr-FR')} DA`)
      }
      if (typeof input.agent_id === 'string' && input.agent_id) {
        patch.agent_id = input.agent_id
        changes.push(`agent → ${input.agent_id}`)
      }
      if (typeof input.is_priority === 'boolean') {
        patch.is_priority = input.is_priority
        changes.push(input.is_priority ? 'marqué prioritaire' : 'priorité retirée')
      }
      if (Object.keys(patch).length === 0) return { result: 'Erreur: rien à modifier', is_error: true }
      const { error } = await supabase.from('clients').update(patch).eq('tenant_id', tenantId).eq('id', clientId)
      if (error) return { result: `Erreur SQL: ${error.message}`, is_error: true }

      // Mirror change in clients.notes for audit visibility
      await _appendClientNote(supabase, clientId, `✏️ Mise à jour client (X)`, changes.join(', '))

      return { result: `Client mis à jour: ${Object.keys(patch).join(', ')}`, is_error: false }
    }

    if (toolName === 'mark_visit_completed') {
      // Mirrors completeTask in TaskDetailModal (src/pages/tasks/components/TaskDetailModal.tsx).
      // Side-effects: update visit status → history → bump
      // clients.last_contact_at → mirror in clients.notes.
      const visitId = String(input.visit_id ?? '')
      const outcome = String(input.outcome ?? '')
      if (!visitId || !outcome) return { result: 'Erreur: visit_id et outcome obligatoires', is_error: true }

      // visits.status accepts: planned, confirmed, completed, cancelled, rescheduled
      const statusMap: Record<string, string> = {
        interested: 'completed',
        not_interested: 'completed',
        rescheduled: 'rescheduled',
        no_show: 'cancelled',
      }
      const newStatus = statusMap[outcome] ?? 'completed'

      // 1. Look up the visit for client_id + scheduled_at (needed for history + note)
      const { data: visitRow } = await supabase
        .from('visits')
        .select('client_id, scheduled_at, visit_type')
        .eq('tenant_id', tenantId)
        .eq('id', visitId)
        .single()
      const visit = visitRow as { client_id: string; scheduled_at: string; visit_type: string } | null
      if (!visit) return { result: 'Erreur: visite introuvable', is_error: true }

      // 2. Update visit status + outcome tag in notes
      const outcomeTag = `[${outcome}]`
      const patch: Record<string, unknown> = { status: newStatus }
      if (input.notes) patch.notes = `${outcomeTag} ${String(input.notes)}`
      else patch.notes = outcomeTag
      const { error } = await supabase.from('visits').update(patch).eq('tenant_id', tenantId).eq('id', visitId)
      if (error) return { result: `Erreur SQL: ${error.message}`, is_error: true }

      // 3. History
      const dateStr = new Date(visit.scheduled_at).toLocaleDateString('fr-FR')
      await _insertHistory(supabase, tenantId, visit.client_id, agentId, 'visit_completed',
        `Visite ${dateStr} clôturée (${outcome})`,
        { visit_id: visitId, outcome, status: newStatus },
      )

      // 4. Bump last_contact_at on the client
      await _updateLastContact(supabase, visit.client_id)

      // 5. Mirror in clients.notes
      const outcomeLabel = ({
        interested: '✅ Visite intéressée',
        not_interested: '❌ Visite pas intéressée',
        rescheduled: '🔄 Visite à reprogrammer',
        no_show: '⏸️ Client absent (no-show)',
      } as Record<string, string>)[outcome] ?? `Visite clôturée: ${outcome}`
      await _appendClientNote(supabase, visit.client_id, outcomeLabel, input.notes ? String(input.notes) : null)

      return { result: `Visite marquée '${newStatus}' (${outcome})`, is_error: false }
    }

    if (toolName === 'send_whatsapp') {
      const clientId = String(input.client_id ?? '')
      const message = String(input.message ?? '').trim()
      if (!clientId || !message) return { result: 'Erreur: client_id et message obligatoires', is_error: true }
      // Delegate to the existing send-whatsapp Edge Function (handles
      // template fallback, 24h window, Meta API auth, etc.).
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'X-Tenant-Id': tenantId,
            'X-User-Id': agentId,
          },
          body: JSON.stringify({ client_id: clientId, message, tenant_id: tenantId, sender_id: agentId }),
        })
        if (!resp.ok) {
          const txt = await resp.text().catch(() => 'unknown')
          return { result: `Erreur WhatsApp ${resp.status}: ${txt.slice(0, 150)}`, is_error: true }
        }
        return { result: `Message WhatsApp envoyé`, is_error: false }
      } catch (err) {
        return { result: `Erreur réseau WhatsApp: ${err instanceof Error ? err.message : String(err)}`, is_error: true }
      }
    }

    return { result: `Outil inconnu: ${toolName}`, is_error: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { result: `Exception: ${msg}`, is_error: true }
  }
}

// ─── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const startedAt = Date.now()

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    if (!anthropicKey) return json({ error: 'AI not configured (server)' }, 503)

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Resolve caller
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    const { data: profile } = await supabase
      .from('users')
      .select('tenant_id, first_name, last_name, role')
      .eq('id', user.id)
      .single()
    if (!profile?.tenant_id) return json({ error: 'No tenant' }, 403)

    // Plan feature gate
    const featureCheck = await checkPlanFeature(supabase, profile.tenant_id, 'x_assistant_qa')
    if (!featureCheck.allowed) {
      return json({
        error: featureCheck.reason === 'plan'
          ? `Assistant X non inclus dans votre plan (${featureCheck.plan}).`
          : `Assistant X désactivé par l'administrateur de votre agence.`,
        reason: featureCheck.reason,
      }, 403)
    }

    // Per-tenant Anthropic quota (shared with the other AI features)
    const quota = await checkQuota(supabase, profile.tenant_id, 'anthropic')
    if (!quota.allowed) return quotaErrorResponse(quota, corsHeaders)

    // Parse + validate input
    const body = await req.json()
    const rawQuestion = body?.question
    const language = (body?.language === 'ar' ? 'ar' : 'fr') as 'fr' | 'ar'
    const conversation = Array.isArray(body?.conversation) ? body.conversation as Array<{ role: 'user' | 'assistant'; content: string }> : []

    if (typeof rawQuestion !== 'string' || rawQuestion.trim().length === 0) {
      return json({ error: 'Question vide' }, 400)
    }
    if (rawQuestion.length > 1500) {
      return json({ error: 'Question trop longue (max 1500 caractères)' }, 400)
    }

    const question = sanitizeForPrompt(rawQuestion).slice(0, 1500)

    // ───── Build tenant context ─────────────────────────────────
    const [tenantRes, agentsRes, projectsRes, clientsRes, visitsRes, tasksRes] = await Promise.all([
      supabase.from('tenants').select('name, wilaya').eq('id', profile.tenant_id).single(),
      supabase.from('users').select('id, first_name, last_name, role, status').eq('tenant_id', profile.tenant_id).eq('status', 'active').limit(50),
      supabase.from('projects').select('id, name, code, status').eq('tenant_id', profile.tenant_id).eq('status', 'active').limit(20),
      supabase.from('clients').select('id, full_name, phone, pipeline_stage, confirmed_budget, source, agent_id, last_contact_at, is_priority').eq('tenant_id', profile.tenant_id).order('updated_at', { ascending: false }).limit(50),
      supabase.from('visits').select('id, client_id, scheduled_at, visit_type, status').eq('tenant_id', profile.tenant_id).gte('scheduled_at', new Date(Date.now() - 7 * 86400000).toISOString()).limit(50),
      supabase.from('tasks').select('id, client_id, title, due_at, status, priority').eq('tenant_id', profile.tenant_id).eq('status', 'pending').limit(30),
    ])

    const tenantInfo = tenantRes.data as { name: string; wilaya: string | null } | null
    const agents = (agentsRes.data ?? []) as Array<{ id: string; first_name: string; last_name: string; role: string }>
    const projects = (projectsRes.data ?? []) as Array<{ id: string; name: string; code: string | null }>
    const clients = (clientsRes.data ?? []) as Array<{ id: string; full_name: string; phone: string; pipeline_stage: string; confirmed_budget: number | null; source: string; agent_id: string | null; last_contact_at: string | null; is_priority: boolean }>
    const visits = (visitsRes.data ?? []) as Array<{ client_id: string; scheduled_at: string; visit_type: string; status: string }>
    const tasks = (tasksRes.data ?? []) as Array<{ client_id: string; title: string; due_at: string | null; priority: string | null }>

    const agentMap = new Map(agents.map(a => [a.id, `${a.first_name} ${a.last_name}`]))

    const contextLines: string[] = []
    contextLines.push(`AGENCE: ${tenantInfo?.name ?? '?'} (${tenantInfo?.wilaya ?? '?'})`)
    contextLines.push(`UTILISATEUR: ${profile.first_name} ${profile.last_name} (${profile.role}) — id: ${user.id}`)
    contextLines.push(`DATE DU JOUR: ${new Date().toISOString().slice(0, 10)} (${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })})`)
    contextLines.push('')

    contextLines.push(`AGENTS (${agents.length}):`)
    for (const a of agents.slice(0, 30)) contextLines.push(`- ${a.first_name} ${a.last_name} (${a.role}) — id: ${a.id}`)
    contextLines.push('')

    contextLines.push(`PROJETS ACTIFS (${projects.length}):`)
    for (const p of projects.slice(0, 20)) contextLines.push(`- ${p.name}${p.code ? ` [${p.code}]` : ''}`)
    contextLines.push('')

    contextLines.push(`CLIENTS RÉCENTS (${clients.length}, triés par dernière mise à jour):`)
    for (const c of clients) {
      const agentName = c.agent_id ? agentMap.get(c.agent_id) ?? '?' : 'non assigné'
      const budget = c.confirmed_budget ? `${c.confirmed_budget.toLocaleString('fr-FR')} DA` : 'budget?'
      const lastContact = c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString('fr-FR') : 'jamais'
      contextLines.push(`- id=${c.id} | ${c.full_name} | ${c.phone} | étape: ${c.pipeline_stage} | ${budget} | source: ${c.source} | agent: ${agentName} | dernier contact: ${lastContact}${c.is_priority ? ' | PRIORITAIRE' : ''}`)
    }
    contextLines.push('')

    contextLines.push(`VISITES 7 DERNIERS JOURS + À VENIR (${visits.length}):`)
    for (const v of visits.slice(0, 30)) {
      const cli = clients.find(c => c.id === v.client_id)?.full_name ?? '?'
      contextLines.push(`- ${cli} | ${new Date(v.scheduled_at).toLocaleString('fr-FR')} | ${v.visit_type} | ${v.status}`)
    }
    contextLines.push('')

    contextLines.push(`TÂCHES EN COURS (${tasks.length}):`)
    for (const t of tasks.slice(0, 20)) {
      const cli = clients.find(c => c.id === t.client_id)?.full_name ?? '?'
      const due = t.due_at ? new Date(t.due_at).toLocaleDateString('fr-FR') : 'sans date'
      contextLines.push(`- ${t.title} | client: ${cli} | due: ${due} | priorité: ${t.priority ?? '?'}`)
    }

    const tenantContext = contextLines.join('\n')

    // ───── Compose Claude messages ──────────────────────────────
    const systemPrompt = (language === 'ar' ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_FR) +
      '\n\n' + wrapUntrusted('CONTEXTE TENANT', tenantContext, 50000)

    // Trim conversation history to last 10 turns to keep tokens bounded.
    // History is plain text only (no tool_use blocks from prior turns).
    const trimmedHistory: Array<{ role: 'user' | 'assistant'; content: unknown }> = conversation.slice(-10).map(m => ({
      role: m.role,
      content: sanitizeForPrompt(String(m.content)).slice(0, 1500),
    }))

    const initialMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
      ...trimmedHistory,
      { role: 'user', content: question },
    ]

    // ───── Streaming response ──────────────────────────────────
    // The Edge Function returns a Server-Sent Events stream so the
    // frontend can render Claude's tokens as they arrive (~1s perceived
    // first-word latency vs ~5s buffered). We also stream tool_start /
    // tool_done markers so the UI can show "Recherche client…" indicators.
    //
    // Wire format (each line is `data: <json>\n\n`):
    //   { type: 'text',      delta: string }
    //   { type: 'tool_start', name: string }
    //   { type: 'tool_done',  name: string, ok: boolean }
    //   { type: 'final',      cost_da, duration_ms, tokens, actions }
    //   { type: 'error',      message: string }

    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: object) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`))
          } catch {
            // Controller was already closed (client aborted) — ignore.
          }
        }

        let messages = initialMessages
        let totalInputTokens = 0
        let totalOutputTokens = 0
        let cacheReadTokens = 0
        const actionsLog: Array<{ tool: string; input: unknown; result: string; is_error: boolean }> = []
        let finalText = ''
        const MAX_ITERATIONS = 5

        try {
          for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
            const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 400,
                system: [
                  { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
                ],
                tools: TOOLS,
                messages,
                stream: true,
              }),
            })

            if (!apiResp.ok || !apiResp.body) {
              const txt = await apiResp.text().catch(() => 'unknown')
              console.error('Anthropic error:', apiResp.status, txt)
              send({ type: 'error', message: `Erreur IA ${apiResp.status}` })
              try {
                await supabase.from('x_interactions' as never).insert({
                  tenant_id: profile.tenant_id,
                  user_id: user.id,
                  type: 'question',
                  input_text: question,
                  success: false,
                  error_msg: `Anthropic ${apiResp.status}: ${txt.slice(0, 200)}`,
                  duration_ms: Date.now() - startedAt,
                } as never)
              } catch { /* ignore */ }
              controller.close()
              return
            }

            // Parse Anthropic's SSE stream and forward text deltas to the
            // client in real time. Tool-use blocks are accumulated locally
            // (their input JSON streams in piece by piece) and executed
            // after the message_stop event for this iteration.
            const reader = apiResp.body.getReader()
            const dec = new TextDecoder()
            let buffer = ''
            const blocks: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; _inputJson?: string }> = []
            let currentBlock: typeof blocks[number] | null = null
            let stopReason = 'end_turn'

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += dec.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''

              for (const line of lines) {
                if (!line.startsWith('data: ')) continue
                let event: { type: string; index?: number; content_block?: { type: string; id?: string; name?: string; text?: string }; delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string }; message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number } }; usage?: { output_tokens?: number } }
                try { event = JSON.parse(line.slice(6)) } catch { continue }

                const t = event.type
                if (t === 'message_start') {
                  totalInputTokens += event.message?.usage?.input_tokens ?? 0
                  cacheReadTokens += event.message?.usage?.cache_read_input_tokens ?? 0
                } else if (t === 'content_block_start') {
                  const cb = event.content_block ?? { type: 'text' }
                  currentBlock = { type: cb.type, id: cb.id, name: cb.name, text: cb.text ?? '' }
                  if (cb.type === 'tool_use') {
                    currentBlock._inputJson = ''
                    send({ type: 'tool_start', name: cb.name ?? '?' })
                  }
                } else if (t === 'content_block_delta' && currentBlock) {
                  if (event.delta?.type === 'text_delta') {
                    const txt = event.delta.text ?? ''
                    currentBlock.text = (currentBlock.text ?? '') + txt
                    send({ type: 'text', delta: txt })
                  } else if (event.delta?.type === 'input_json_delta') {
                    currentBlock._inputJson = (currentBlock._inputJson ?? '') + (event.delta.partial_json ?? '')
                  }
                } else if (t === 'content_block_stop' && currentBlock) {
                  if (currentBlock.type === 'tool_use') {
                    try { currentBlock.input = JSON.parse(currentBlock._inputJson || '{}') } catch { currentBlock.input = {} }
                    delete currentBlock._inputJson
                  }
                  blocks.push(currentBlock)
                  currentBlock = null
                } else if (t === 'message_delta') {
                  if (event.delta?.stop_reason) stopReason = event.delta.stop_reason
                  totalOutputTokens += event.usage?.output_tokens ?? 0
                }
              }
            }

            // Reassemble the assistant turn for the next iteration.
            const assistantContent = blocks.map(b => {
              if (b.type === 'text') return { type: 'text', text: b.text ?? '' }
              if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} }
              return b
            })
            messages = [...messages, { role: 'assistant', content: assistantContent }]

            if (stopReason === 'end_turn' || stopReason === 'stop_sequence') {
              finalText = blocks.find(b => b.type === 'text')?.text?.trim() ?? ''
              break
            }

            if (stopReason === 'tool_use') {
              const toolUseBlocks = blocks.filter(b => b.type === 'tool_use' && b.id && b.name)
              if (toolUseBlocks.length === 0) {
                finalText = blocks.find(b => b.type === 'text')?.text?.trim() ?? ''
                break
              }
              const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }> = []
              for (const tu of toolUseBlocks) {
                const exec = await executeTool(supabase, profile.tenant_id, user.id, tu.name!, tu.input ?? {})
                actionsLog.push({ tool: tu.name!, input: tu.input ?? {}, result: exec.result, is_error: exec.is_error })
                send({ type: 'tool_done', name: tu.name!, ok: !exec.is_error })
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: tu.id!,
                  content: exec.result,
                  is_error: exec.is_error,
                })
              }
              messages = [...messages, { role: 'user', content: toolResults }]
              continue
            }

            // Unexpected stop_reason (max_tokens, refusal) — bail out with whatever text we have
            finalText = blocks.find(b => b.type === 'text')?.text?.trim()
              ?? `Réponse incomplète (stop: ${stopReason}).`
            break
          }

          if (!finalText) finalText = 'Demande trop complexe. Reformule plus simplement.'

          const costDa = totalInputTokens * 0.00025 + totalOutputTokens * 0.00125
          const durationMs = Date.now() - startedAt

          send({
            type: 'final',
            cost_da: costDa,
            duration_ms: durationMs,
            tokens: totalInputTokens + totalOutputTokens,
            cache_read_tokens: cacheReadTokens,
            actions: actionsLog.map(a => ({ tool: a.tool, ok: !a.is_error })),
          })

          // Best-effort cost + audit log — never block stream close
          try {
            await trackAnthropicCost(
              supabase,
              { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
              { tenantId: profile.tenant_id, operation: 'x_assistant_qa' },
            )
          } catch { /* ignore */ }

          try {
            await supabase.from('x_interactions' as never).insert({
              tenant_id: profile.tenant_id,
              user_id: user.id,
              type: actionsLog.length > 0 ? 'action' : 'question',
              input_text: question,
              response_text: finalText,
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
              cost_da: costDa,
              duration_ms: durationMs,
              success: true,
              metadata: actionsLog.length > 0 ? { actions: actionsLog } : null,
            } as never)
          } catch { /* ignore */ }

          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('Fatal in stream:', msg)
          send({ type: 'error', message: 'Erreur interne' })
          try { controller.close() } catch { /* already closed */ }
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal:', msg)
    return json({ error: 'Erreur interne' }, 500)
  }
})
