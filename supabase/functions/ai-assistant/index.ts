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
] as const

const SYSTEM_PROMPT_FR = `Tu es X, l'assistant IA d'IMMO PRO-X (CRM immobilier algérien). Tu réponds aux questions de l'agent immobilier ET tu peux exécuter des actions via les outils fournis.

OUTILS DISPONIBLES :
- search_clients : trouver un client par nom/téléphone (utilise-le pour récupérer un client_id)
- create_client : créer un nouveau lead dans le pipeline
- create_visit : programmer une visite pour un client (nécessite client_id)
- create_task : créer une tâche/rappel pour un client (nécessite client_id)
- update_client_stage : changer l'étape pipeline d'un client

QUAND UTILISER LES OUTILS :
- L'utilisateur dit "crée", "ajoute", "programme", "passe en", "marque comme" → utilise un outil
- Pour create_visit / create_task / update_client_stage : si tu n'as pas le client_id, appelle search_clients D'ABORD
- Si une info obligatoire manque (ex: téléphone pour create_client), DEMANDE-LA avant d'agir
- Si le client n'existe pas (search_clients renvoie vide), dis-le et propose de le créer

RÈGLES DE RÉPONSE :
- Réponds en 1 à 3 phrases courtes, prêtes pour la voix
- Pas de listes à puces, pas de markdown, pas d'emojis
- Tutoie l'agent
- Pas de formules de politesse — droit au but
- Après une action réussie, CONFIRME ce que tu as fait avec les détails (nom client, date, type de visite)
- Si une action échoue, explique pourquoi en 1 phrase
- Pour les questions read-only : appuie-toi UNIQUEMENT sur les données du contexte ; si l'info n'y est pas, dis-le

FORMATS :
- Montants en DA avec espaces (12 500 000 DA)
- Dates en français à l'oral (15 juin), mais ISO 8601 dans les paramètres d'outils (2026-06-15T10:00:00)
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

interface ToolResult {
  result: string
  is_error: boolean
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
      return { result: `Client créé. id=${(data as { id: string }).id}`, is_error: false }
    }

    if (toolName === 'create_visit') {
      const payload = {
        tenant_id: tenantId,
        client_id: String(input.client_id ?? ''),
        agent_id: agentId,
        scheduled_at: String(input.scheduled_at ?? ''),
        visit_type: String(input.visit_type ?? 'on_site'),
        status: 'planned',
      }
      if (!payload.client_id || !payload.scheduled_at) {
        return { result: 'Erreur: client_id et scheduled_at obligatoires', is_error: true }
      }
      const { data, error } = await supabase.from('visits').insert(payload).select('id').single()
      if (error) return { result: `Erreur création visite: ${error.message}`, is_error: true }
      return { result: `Visite créée. id=${(data as { id: string }).id}`, is_error: false }
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
      const clientId = String(input.client_id ?? '')
      const newStage = String(input.new_stage ?? '')
      if (!clientId || !newStage) return { result: 'Erreur: client_id et new_stage obligatoires', is_error: true }
      const { error } = await supabase
        .from('clients')
        .update({ pipeline_stage: newStage })
        .eq('tenant_id', tenantId)
        .eq('id', clientId)
      if (error) return { result: `Erreur SQL: ${error.message}`, is_error: true }
      return { result: `Étape changée vers '${newStage}'`, is_error: false }
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

    let messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
      ...trimmedHistory,
      { role: 'user', content: question },
    ]

    // ───── Tool-use loop ────────────────────────────────────────
    let totalInputTokens = 0
    let totalOutputTokens = 0
    const actionsLog: Array<{ tool: string; input: unknown; result: string; is_error: boolean }> = []
    let finalText = ''
    const MAX_ITERATIONS = 5

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
          max_tokens: 600,
          system: systemPrompt,
          tools: TOOLS,
          messages,
        }),
      })

      if (!apiResp.ok) {
        const txt = await apiResp.text().catch(() => 'unknown')
        console.error('Anthropic error:', apiResp.status, txt)
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
        } catch { /* best-effort log */ }
        return json({ error: 'Erreur du modèle IA. Réessayez dans un instant.' }, 502)
      }

      const data = await apiResp.json() as {
        content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>
        stop_reason?: string
        usage?: { input_tokens: number; output_tokens: number }
      }

      totalInputTokens += data.usage?.input_tokens ?? 0
      totalOutputTokens += data.usage?.output_tokens ?? 0
      const stopReason = data.stop_reason ?? 'end_turn'
      const contentBlocks = data.content ?? []

      // Append the assistant turn EXACTLY as Claude returned it.
      // Tool-use blocks must be preserved so the next turn can reference them.
      messages.push({ role: 'assistant', content: contentBlocks })

      if (stopReason === 'end_turn' || stopReason === 'stop_sequence') {
        finalText = contentBlocks.find(b => b.type === 'text')?.text?.trim() ?? ''
        break
      }

      if (stopReason === 'tool_use') {
        const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use' && b.id && b.name)
        if (toolUseBlocks.length === 0) {
          finalText = contentBlocks.find(b => b.type === 'text')?.text?.trim() ?? ''
          break
        }
        const toolResults = []
        for (const tu of toolUseBlocks) {
          const exec = await executeTool(supabase, profile.tenant_id, user.id, tu.name!, tu.input ?? {})
          actionsLog.push({ tool: tu.name!, input: tu.input ?? {}, result: exec.result, is_error: exec.is_error })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id!,
            content: exec.result,
            is_error: exec.is_error,
          })
        }
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // Other stop reasons (max_tokens, refusal) — bail with whatever text we have
      finalText = contentBlocks.find(b => b.type === 'text')?.text?.trim()
        ?? `Réponse incomplète (stop: ${stopReason}).`
      break
    }

    if (!finalText) finalText = 'Demande trop complexe. Reformule plus simplement.'

    const costDa = totalInputTokens * 0.00025 + totalOutputTokens * 0.00125
    const durationMs = Date.now() - startedAt

    // Cost tracking + interaction log (best-effort, never block the response)
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

    return json({
      response: finalText,
      tokens_used: totalInputTokens + totalOutputTokens,
      cost_da: costDa,
      duration_ms: durationMs,
      actions: actionsLog.map(a => ({ tool: a.tool, ok: !a.is_error })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal:', msg)
    return json({ error: 'Erreur interne' }, 500)
  }
})
