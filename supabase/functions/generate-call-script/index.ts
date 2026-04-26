import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkPlanFeature } from '../_shared/checkPlanFeature.ts'
import { trackAnthropicCost } from '../_shared/trackCost.ts'
import { checkQuota, quotaErrorResponse } from '../_shared/checkQuota.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    // 1. Verify JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    // Resolve tenant + feature gate
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    const tenantId = (profile as { tenant_id: string } | null)?.tenant_id
    if (!tenantId) return json({ error: 'No tenant' }, 403)

    const featureCheck = await checkPlanFeature(supabase, tenantId, 'ai_scripts')
    if (!featureCheck.allowed) {
      return json({
        error: featureCheck.reason === 'plan'
          ? `Les scripts d'appel IA ne sont pas inclus dans votre plan (${featureCheck.plan}).`
          : `Les scripts d'appel IA ont été désactivés par l'administrateur de votre agence.`,
        reason: featureCheck.reason,
        plan: featureCheck.plan,
      }, 403)
    }

    // 2. Parse request
    const { client_id } = await req.json()
    if (!client_id) return json({ error: 'client_id required' }, 400)

    // 3. Load COMPLETE client dossier (everything we know about this client)
    const [clientRes, historyRes, visitsRes, reservationsRes, salesRes, tasksRes, callResponsesRes, schedulesRes] = await Promise.all([
      supabase.from('clients').select('*, users!clients_agent_id_fkey(first_name, last_name, phone), tenants(name, phone)').eq('id', client_id).single(),
      supabase.from('history').select('type, title, description, created_at').eq('client_id', client_id).order('created_at', { ascending: false }).limit(20),
      supabase.from('visits').select('scheduled_at, status, visit_type, notes, projects(name)').eq('client_id', client_id).order('scheduled_at', { ascending: false }).limit(5),
      supabase.from('reservations').select('status, deposit_amount, expires_at, duration_days, units(code, type, subtype, price, surface, floor, projects(name))').eq('client_id', client_id).limit(3),
      supabase.from('sales').select('final_price, financing_mode, status, units(code, type, price)').eq('client_id', client_id).limit(3),
      supabase.from('tasks').select('title, status, channel, client_response, completed_at').eq('client_id', client_id).is('deleted_at', null).order('created_at', { ascending: false }).limit(10),
      supabase.from('call_responses').select('responses, result, duration_seconds, ai_summary, created_at').eq('client_id', client_id).order('created_at', { ascending: false }).limit(5),
      supabase.from('payment_schedules').select('description, amount, due_date, status').eq('sale_id', client_id).order('due_date').limit(10),
    ])

    if (clientRes.error) return json({ error: 'Client not found' }, 404)

    const client = clientRes.data as Record<string, unknown>
    const history = (historyRes.data ?? []) as Array<Record<string, unknown>>
    const visits = (visitsRes.data ?? []) as Array<Record<string, unknown>>
    const reservations = (reservationsRes.data ?? []) as Array<Record<string, unknown>>
    const sales = (salesRes.data ?? []) as Array<Record<string, unknown>>
    const tasks = (tasksRes.data ?? []) as Array<Record<string, unknown>>
    const callResponses = (callResponsesRes.data ?? []) as Array<Record<string, unknown>>
    const schedules = (schedulesRes.data ?? []) as Array<Record<string, unknown>>

    const agent = client.users as { first_name: string; last_name: string; phone: string | null } | null
    const tenant = client.tenants as { name: string; phone: string | null } | null

    // Calculate days since last contact
    const lastContact = client.last_contact_at ? new Date(client.last_contact_at as string) : null
    const daysSinceContact = lastContact ? Math.floor((Date.now() - lastContact.getTime()) / 86400000) : null

    // Calculate total interactions
    const totalCalls = history.filter(h => ['call', 'whatsapp_call'].includes(h.type as string)).length
    const totalMessages = history.filter(h => ['whatsapp_message', 'sms', 'email'].includes(h.type as string)).length
    const totalVisits = visits.length

    // Previous call responses summary
    const previousCallSummary = callResponses.slice(0, 3).map(cr => ({
      date: cr.created_at,
      result: cr.result,
      duration: `${Math.floor((cr.duration_seconds as number ?? 0) / 60)}min`,
      summary: cr.ai_summary,
      responses: cr.responses,
    }))

    // Build the complete dossier
    const dossier = {
      client: {
        name: client.full_name,
        phone: client.phone,
        email: client.email,
        stage: client.pipeline_stage,
        budget: client.confirmed_budget,
        interest_level: client.interest_level,
        desired_types: client.desired_unit_types,
        interested_projects: client.interested_projects,
        source: client.source,
        client_type: client.client_type,
        profession: client.profession,
        nationality: client.nationality,
        address: client.address,
        payment_method: client.payment_method,
        notes: client.notes,
        last_contact: client.last_contact_at,
        days_since_contact: daysSinceContact,
        is_priority: client.is_priority,
        visit_note: client.visit_note,
        visit_feedback: client.visit_feedback,
        created_at: client.created_at,
      },
      stats: {
        total_calls: totalCalls,
        total_messages: totalMessages,
        total_visits: totalVisits,
        total_interactions: history.length,
      },
      agent: {
        name: agent ? `${agent.first_name} ${agent.last_name}` : 'Agent',
        phone: agent?.phone ?? '',
      },
      agency: tenant?.name ?? 'Agence',
      agency_phone: tenant?.phone ?? '',
      recent_history: history.slice(0, 10).map(h => ({
        type: h.type,
        title: h.title,
        description: h.description,
        date: h.created_at,
      })),
      visits: visits.map(v => ({
        date: v.scheduled_at,
        status: v.status,
        type: v.visit_type,
        notes: v.notes,
        project: (v.projects as { name: string } | null)?.name,
      })),
      reservations: reservations.map(r => ({
        status: r.status,
        deposit: r.deposit_amount,
        expires: r.expires_at,
        unit: r.units,
      })),
      sales: sales.map(s => ({
        price: s.final_price,
        financing: s.financing_mode,
        status: s.status,
        unit: s.units,
      })),
      pending_tasks: tasks.filter(t => t.status === 'pending' || t.status === 'scheduled').map(t => t.title),
      completed_tasks: tasks.filter(t => t.status === 'completed').map(t => ({
        title: t.title,
        response: t.client_response,
      })),
      previous_calls: previousCallSummary,
      payment_schedules: schedules.map(s => ({
        description: s.description,
        amount: s.amount,
        due_date: s.due_date,
        status: s.status,
      })),
    }

    // 4. Load playbook
    const { data: playbook } = await supabase
      .from('sale_playbooks')
      .select('methodology, objective, tone, closing_phrases, objection_rules, custom_instructions')
      .eq('tenant_id', client.tenant_id as string)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    // 5. If no AI key, return template
    if (!anthropicKey) {
      const { data: defaultScript } = await supabase
        .from('call_scripts')
        .select('*')
        .eq('tenant_id', client.tenant_id as string)
        .eq('pipeline_stage', client.pipeline_stage as string)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (defaultScript) {
        const replaceVars = (text: string) => text
          .replace(/\[nom\]/g, client.full_name as string)
          .replace(/\[agent\]/g, dossier.agent.name)
          .replace(/\[agence\]/g, dossier.agency)

        return json({
          mode: 'template',
          intro: replaceVars(defaultScript.intro_text ?? ''),
          questions: defaultScript.questions,
          talking_points: [],
          outro: replaceVars(defaultScript.outro_text ?? ''),
          suggested_action: null,
          script_id: defaultScript.id,
        })
      }
      return json({ error: 'No AI key and no template found' }, 404)
    }

    // 6. Build the AI prompt with EVERYTHING
    const playbookContext = playbook ? `
PLAYBOOK DE VENTE (RESPECTER ABSOLUMENT):
- Methodologie: ${(playbook as Record<string, unknown>).methodology ?? 'custom'}
- Objectif: ${(playbook as Record<string, unknown>).objective ?? 'Qualifier et obtenir un rendez-vous visite'}
- Ton de voix: ${(playbook as Record<string, unknown>).tone ?? 'Professionnel'}
- Instructions: ${(playbook as Record<string, unknown>).custom_instructions ?? ''}

REGLES D'OBJECTION:
${JSON.stringify((playbook as Record<string, unknown>).objection_rules ?? [], null, 2)}

PHRASES DE CLOSING:
${JSON.stringify((playbook as Record<string, unknown>).closing_phrases ?? [], null, 2)}
` : ''

    const prompt = `Tu es un expert en vente immobiliere en Algerie. Tu dois generer un script d'appel telephonique HYPER-PERSONNALISE pour un agent commercial.

${playbookContext}

DOSSIER COMPLET DU CLIENT:
${JSON.stringify(dossier, null, 2)}

REGLES IMPORTANTES:
1. Le script doit etre adapte a l'ETAPE ACTUELLE "${client.pipeline_stage}" du client
2. Si le client a deja ete appele (voir previous_calls), REFERENCE les conversations precedentes. Par exemple: "Suite a notre echange de mardi dernier..."
3. Si le client a des NOTES, utilise-les pour personnaliser. Par exemple si les notes disent "interesse par F4 etage eleve", mentionne ca
4. Si le client a un FEEDBACK de visite, reference-le: "Vous aviez bien aime la vue depuis le 8eme etage..."
5. Si le client a des TACHES en attente (pending_tasks), integre-les dans le script
6. Si le client a des PAIEMENTS en retard, mentionne-les delicatement
7. Adapte le TON selon le nombre d'interactions: 1er appel = formel, 3eme+ = plus familier
8. Si days_since_contact > 7, commence par "Ca fait un moment qu'on ne s'est pas parle..."
9. Utilise le PRENOM du client (pas le nom complet) sauf au 1er contact
10. JAMAIS donner le prix exact — dire "a partir de" et inviter a la visite

GENERE un JSON avec:
1. "intro": 2-3 phrases d'introduction PERSONNALISEES basees sur l'historique reel du client
2. "questions": 4-6 questions adaptees a l'etape. Chaque question:
   {
     "id": "q1",
     "question": "...",
     "type": "select|radio|text|number|checkbox|date",
     "options": [...] si applicable,
     "maps_to": champ client optionnel (confirmed_budget, desired_unit_types, interest_level, payment_method),
     "conditions": [
       { "if": "reponse", "then_say": "ce que l'agent dit" },
       { "if_default": true, "then_say": "reponse par defaut" }
     ]
   }
3. "talking_points": 3-4 arguments de vente SPECIFIQUES au profil du client (pas generiques)
4. "outro": conclusion avec phrase de closing du playbook. Objectif = date de visite ou prochaine etape
5. "suggested_action": action concrete recommandee (ex: "Envoyer simulation F4 12eme etage par WhatsApp")

REPONDS UNIQUEMENT avec le JSON, aucun texte autour.`

    // 6.5 Quota check — block if monthly cap or hourly burst exhausted.
    const quota = await checkQuota(supabase, tenantId, 'anthropic')
    if (!quota.allowed) return quotaErrorResponse(quota, corsHeaders)

    // 7. Call Claude API
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiResponse.ok) {
      console.error('AI error:', aiResponse.status, await aiResponse.text())
      // Fallback to template
      const { data: fallbackScript } = await supabase
        .from('call_scripts')
        .select('*')
        .eq('tenant_id', client.tenant_id as string)
        .eq('pipeline_stage', client.pipeline_stage as string)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (fallbackScript) {
        const replaceVars = (text: string) => text
          .replace(/\[nom\]/g, client.full_name as string)
          .replace(/\[agent\]/g, dossier.agent.name)
          .replace(/\[agence\]/g, dossier.agency)

        return json({
          mode: 'template',
          intro: replaceVars(fallbackScript.intro_text ?? ''),
          questions: fallbackScript.questions,
          talking_points: [],
          outro: replaceVars(fallbackScript.outro_text ?? ''),
          suggested_action: null,
          script_id: fallbackScript.id,
        })
      }
      return json({ error: 'AI failed and no template available' }, 502)
    }

    const aiData = await aiResponse.json()
    const text = aiData.content?.[0]?.text ?? ''

    await trackAnthropicCost(supabase, aiData.usage, {
      tenantId,
      operation: 'generate-call-script',
      metadata: { client_id, model: aiData.model ?? 'claude-haiku-4-5-20251001' },
    })

    // Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Invalid AI response:', text.slice(0, 200))
      return json({ error: 'Invalid AI response' }, 502)
    }

    const script = JSON.parse(jsonMatch[0])

    return json({
      mode: 'ai',
      intro: script.intro ?? '',
      questions: script.questions ?? [],
      talking_points: script.talking_points ?? [],
      outro: script.outro ?? '',
      suggested_action: script.suggested_action ?? null,
      script_id: null,
    })
  } catch (err) {
    console.error('Fatal:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
