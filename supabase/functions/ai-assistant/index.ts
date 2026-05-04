// ai-assistant — Phase 1 of X Assistant. Q&A only (no actions yet).
//
// Flow:
//   1. Authenticate the calling user (must be in a tenant)
//   2. Gate on the x_assistant_qa plan feature
//   3. Build a tenant-scoped context blob: agency name, user's name,
//      top clients (with budget, stage, last contact), recent visits,
//      pending tasks. Capped at ~50 entities to keep tokens bounded.
//   4. Call Claude Haiku with a tight system prompt:
//        - Always factual (only the data in the context)
//        - 1-3 short sentences for voice readout
//        - Same language as the user's input (FR or AR)
//   5. Persist the interaction in x_interactions (audit + cost track)
//
// Phase 2 will add tool-use so X can also INSERT/UPDATE on behalf of
// the user. For now: read-only Q&A.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkPlanFeature } from '../_shared/checkPlanFeature.ts'
import { trackAnthropicCost } from '../_shared/trackCost.ts'
import { checkQuota, quotaErrorResponse } from '../_shared/checkQuota.ts'
import { sanitizeForPrompt, wrapUntrusted } from '../_shared/promptSanitize.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

const SYSTEM_PROMPT_FR = `Tu es X, l'assistant IA d'IMMO PRO-X (CRM immobilier algérien). Tu réponds aux questions de l'agent immobilier avec précision en t'appuyant UNIQUEMENT sur les données fournies dans le contexte.

Règles strictes :
- Réponds en 1 à 3 phrases courtes, prêtes à être lues à voix haute
- Pas de listes à puces, pas de markdown, pas d'emojis
- Si l'info n'est PAS dans le contexte, dis "Je n'ai pas cette information" et propose de reformuler
- Réponds dans la langue de la question (français ou arabe)
- Tutoie l'agent
- Pas de formules de politesse ("Bien sûr", "D'accord") — va droit à la réponse
- Montants en DA, formate avec espaces (12 500 000 DA)
- Dates en français (15 juin)`

const SYSTEM_PROMPT_AR = `أنت X، المساعد الذكي لـ IMMO PRO-X (نظام إدارة العقارات الجزائري). تجيب على أسئلة الوكيل العقاري بدقة مستندًا فقط إلى البيانات المقدمة في السياق.

قواعد صارمة :
- أجب بـ 1 إلى 3 جمل قصيرة، جاهزة للقراءة بصوت عالٍ
- بدون قوائم نقطية، بدون markdown، بدون رموز تعبيرية
- إذا لم تكن المعلومة في السياق، قل "ليس لدي هذه المعلومة" واقترح إعادة الصياغة
- أجب بنفس لغة السؤال (الفرنسية أو العربية)
- خاطب الوكيل بصيغة المخاطب
- بدون عبارات مجاملة ("بالتأكيد"، "حسنًا") — اذهب مباشرة إلى الإجابة
- المبالغ بالدينار الجزائري، نسق بمسافات (12 500 000 دج)`

// Inlined from _shared/cors.ts because the Supabase Dashboard
// deploy flow can't upload _shared files separately. If you move
// to `supabase functions deploy` via CLI, replace with:
//   import { corsHeadersFor } from '../_shared/cors.ts'
const ALLOWED_ORIGINS = new Set<string>([
  'https://app.immoprox.io',
  'http://localhost:5173',
])
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.immoprox.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
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
    // Pull a curated snapshot of the tenant's data. Capped to keep
    // input tokens bounded (~3-5K tokens for a busy tenant).
    // Agents only see context tied to clients they own; admins see the
    // whole tenant. Without this filter, an agent could ask the AI
    // "list all our hot leads" and get clients assigned to coworkers.
    const isAgent = profile.role === 'agent'

    const clientsQuery = supabase.from('clients')
      .select('id, full_name, phone, pipeline_stage, confirmed_budget, source, agent_id, last_contact_at, is_priority')
      .eq('tenant_id', profile.tenant_id)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (isAgent) clientsQuery.eq('agent_id', profile.id)

    const visitsQuery = supabase.from('visits')
      .select('id, client_id, scheduled_at, visit_type, status, agent_id')
      .eq('tenant_id', profile.tenant_id)
      .gte('scheduled_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .limit(50)
    if (isAgent) visitsQuery.eq('agent_id', profile.id)

    const tasksQuery = supabase.from('tasks')
      .select('id, client_id, title, due_date, status, priority, agent_id')
      .eq('tenant_id', profile.tenant_id)
      .eq('status', 'pending')
      .limit(30)
    if (isAgent) tasksQuery.eq('agent_id', profile.id)

    const [tenantRes, agentsRes, projectsRes, clientsRes, visitsRes, tasksRes] = await Promise.all([
      supabase.from('tenants').select('name, wilaya').eq('id', profile.tenant_id).single(),
      supabase.from('users').select('id, first_name, last_name, role, status').eq('tenant_id', profile.tenant_id).eq('status', 'active').limit(50),
      supabase.from('projects').select('id, name, code, status').eq('tenant_id', profile.tenant_id).eq('status', 'active').limit(20),
      clientsQuery,
      visitsQuery,
      tasksQuery,
    ])

    const tenantInfo = tenantRes.data as { name: string; wilaya: string | null } | null
    const agents = (agentsRes.data ?? []) as Array<{ id: string; first_name: string; last_name: string; role: string }>
    const projects = (projectsRes.data ?? []) as Array<{ id: string; name: string; code: string | null }>
    const clients = (clientsRes.data ?? []) as Array<{ id: string; full_name: string; phone: string; pipeline_stage: string; confirmed_budget: number | null; source: string; agent_id: string | null; last_contact_at: string | null; is_priority: boolean }>
    const visits = (visitsRes.data ?? []) as Array<{ client_id: string; scheduled_at: string; visit_type: string; status: string }>
    const tasks = (tasksRes.data ?? []) as Array<{ client_id: string; title: string; due_date: string | null; priority: string | null }>

    const agentMap = new Map(agents.map(a => [a.id, `${a.first_name} ${a.last_name}`]))

    const contextLines: string[] = []
    contextLines.push(`AGENCE: ${tenantInfo?.name ?? '?'} (${tenantInfo?.wilaya ?? '?'})`)
    contextLines.push(`UTILISATEUR: ${profile.first_name} ${profile.last_name} (${profile.role})`)
    contextLines.push(`DATE: ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`)
    contextLines.push('')

    contextLines.push(`AGENTS (${agents.length}):`)
    for (const a of agents.slice(0, 30)) contextLines.push(`- ${a.first_name} ${a.last_name} (${a.role})`)
    contextLines.push('')

    contextLines.push(`PROJETS ACTIFS (${projects.length}):`)
    for (const p of projects.slice(0, 20)) contextLines.push(`- ${p.name}${p.code ? ` [${p.code}]` : ''}`)
    contextLines.push('')

    contextLines.push(`CLIENTS RÉCENTS (${clients.length}, triés par dernière mise à jour):`)
    for (const c of clients) {
      const agentName = c.agent_id ? agentMap.get(c.agent_id) ?? '?' : 'non assigné'
      const budget = c.confirmed_budget ? `${c.confirmed_budget.toLocaleString('fr-FR')} DA` : 'budget?'
      const lastContact = c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString('fr-FR') : 'jamais'
      contextLines.push(`- ${c.full_name} | ${c.phone} | étape: ${c.pipeline_stage} | ${budget} | source: ${c.source} | agent: ${agentName} | dernier contact: ${lastContact}${c.is_priority ? ' | PRIORITAIRE' : ''}`)
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
      const due = t.due_date ? new Date(t.due_date).toLocaleDateString('fr-FR') : 'sans date'
      contextLines.push(`- ${t.title} | client: ${cli} | due: ${due} | priorité: ${t.priority ?? '?'}`)
    }

    const tenantContext = contextLines.join('\n')

    // ───── Compose Claude messages ──────────────────────────────
    const systemPrompt = (language === 'ar' ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_FR) +
      '\n\n' + wrapUntrusted('CONTEXTE TENANT', tenantContext, 50000)

    // Trim conversation history to last 10 turns to keep tokens bounded
    const trimmedHistory = conversation.slice(-10).map(m => ({
      role: m.role,
      content: sanitizeForPrompt(String(m.content)).slice(0, 1500),
    }))

    const messages = [
      ...trimmedHistory,
      { role: 'user' as const, content: question },
    ]

    // ───── Call Claude Haiku ────────────────────────────────────
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
        system: systemPrompt,
        messages,
      }),
    })

    if (!apiResp.ok) {
      const txt = await apiResp.text().catch(() => 'unknown')
      console.error('Anthropic error:', apiResp.status, txt)
      // Log failure to interactions for super-admin visibility
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
      } catch { /* best-effort log, never block */ }
      return json({ error: 'Erreur du modèle IA. Réessayez dans un instant.' }, 502)
    }

    const data = await apiResp.json() as {
      content?: Array<{ type: string; text: string }>
      usage?: { input_tokens: number; output_tokens: number }
    }
    const responseText = data.content?.find(c => c.type === 'text')?.text?.trim() ?? ''
    const inputTokens = data.usage?.input_tokens ?? 0
    const outputTokens = data.usage?.output_tokens ?? 0

    // Same DA-per-token rates as trackCost.ts (250 DA/USD parallel rate).
    const costDa = inputTokens * 0.00025 + outputTokens * 0.00125

    // Cost tracking + interaction log (best-effort, never block the response).
    try {
      await trackAnthropicCost(
        supabase,
        { input_tokens: inputTokens, output_tokens: outputTokens },
        { tenantId: profile.tenant_id, operation: 'x_assistant_qa' },
      )
    } catch { /* ignore */ }

    try {
      await supabase.from('x_interactions' as never).insert({
        tenant_id: profile.tenant_id,
        user_id: user.id,
        type: 'question',
        input_text: question,
        response_text: responseText,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_da: costDa,
        duration_ms: Date.now() - startedAt,
        success: true,
      } as never)
    } catch { /* ignore */ }

    return json({
      response: responseText,
      tokens_used: inputTokens + outputTokens,
      cost_da: costDa,
      duration_ms: Date.now() - startedAt,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal:', msg)
    return json({ error: 'Erreur interne' }, 500)
  }
})
