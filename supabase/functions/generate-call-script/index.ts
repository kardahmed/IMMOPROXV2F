import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // 2. Parse request
    const { client_id } = await req.json()
    if (!client_id) return json({ error: 'client_id required' }, 400)

    // 3. Load client dossier
    const [clientRes, historyRes, visitsRes, reservationsRes] = await Promise.all([
      supabase.from('clients').select('*, users!clients_agent_id_fkey(first_name, last_name), tenants(name)').eq('id', client_id).single(),
      supabase.from('history').select('type, title, description, created_at').eq('client_id', client_id).order('created_at', { ascending: false }).limit(15),
      supabase.from('visits').select('scheduled_at, status, visit_type, notes').eq('client_id', client_id).order('scheduled_at', { ascending: false }).limit(5),
      supabase.from('reservations').select('status, deposit_amount, expires_at, units(code)').eq('client_id', client_id).limit(3),
    ])

    if (clientRes.error) return json({ error: 'Client not found' }, 404)

    const client = clientRes.data as Record<string, unknown>
    const history = (historyRes.data ?? []) as Array<Record<string, unknown>>
    const visits = (visitsRes.data ?? []) as Array<Record<string, unknown>>
    const reservations = (reservationsRes.data ?? []) as Array<Record<string, unknown>>

    const agent = client.users as { first_name: string; last_name: string } | null
    const tenant = client.tenants as { name: string } | null

    // 4. Build context for AI
    const dossier = {
      client: {
        name: client.full_name,
        phone: client.phone,
        email: client.email,
        stage: client.pipeline_stage,
        budget: client.confirmed_budget,
        interest_level: client.interest_level,
        desired_types: client.desired_unit_types,
        source: client.source,
        notes: client.notes,
        last_contact: client.last_contact_at,
        is_priority: client.is_priority,
        visit_note: client.visit_note,
        visit_feedback: client.visit_feedback,
      },
      agent_name: agent ? `${agent.first_name} ${agent.last_name}` : 'Agent',
      agency_name: tenant?.name ?? 'Agence',
      recent_history: history.slice(0, 10).map(h => ({ type: h.type, title: h.title, date: h.created_at })),
      recent_visits: visits.map(v => ({ date: v.scheduled_at, status: v.status, type: v.visit_type, notes: v.notes })),
      reservations: reservations.map(r => ({ status: r.status, deposit: r.deposit_amount, unit: (r.units as { code: string } | null)?.code })),
    }

    // 5. If no AI key, return a template-based script
    if (!anthropicKey) {
      // Fallback: return default script for this stage
      const { data: defaultScript } = await supabase
        .from('call_scripts')
        .select('*')
        .eq('tenant_id', client.tenant_id as string)
        .eq('pipeline_stage', client.pipeline_stage as string)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (defaultScript) {
        // Replace variables in intro/outro
        const replaceVars = (text: string) => text
          .replace(/\[nom\]/g, client.full_name as string)
          .replace(/\[agent\]/g, dossier.agent_name)
          .replace(/\[agence\]/g, dossier.agency_name)
          .replace(/\[projet\]/g, '')
          .replace(/\[prix\]/g, String(client.confirmed_budget ?? ''))

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

      return json({ error: 'No AI key configured and no default script found' }, 404)
    }

    // 6. Load playbook
    const { data: playbook } = await supabase
      .from('sale_playbooks')
      .select('methodology, objective, tone, closing_phrases, objection_rules, custom_instructions')
      .eq('tenant_id', client.tenant_id as string)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    const playbookContext = playbook ? `
PLAYBOOK DE VENTE (A RESPECTER ABSOLUMENT):
- Methodologie: ${(playbook as Record<string, unknown>).methodology ?? 'custom'}
- Objectif: ${(playbook as Record<string, unknown>).objective ?? 'Qualifier et obtenir un rendez-vous visite'}
- Ton de voix: ${(playbook as Record<string, unknown>).tone ?? 'Professionnel'}
- Instructions: ${(playbook as Record<string, unknown>).custom_instructions ?? ''}

REGLES D'OBJECTION (integrer dans les conditions de chaque question):
${JSON.stringify((playbook as Record<string, unknown>).objection_rules ?? [], null, 2)}

PHRASES DE CLOSING (utiliser dans l'outro):
${JSON.stringify((playbook as Record<string, unknown>).closing_phrases ?? [], null, 2)}
` : ''

    // 7. Call Claude API
    const prompt = `Tu es un expert en vente immobiliere. Analyse ce dossier client et genere un script d'appel personnalise et strategique.

${playbookContext}

Dossier client:
${JSON.stringify(dossier, null, 2)}

Genere un script JSON avec:
1. "intro": texte d'introduction personnalise (2-3 phrases). Mentionne la derniere interaction si pertinente. Respecte le ton du playbook.
2. "questions": array de 4-6 questions de qualification adaptees a l'etape "${client.pipeline_stage}". Chaque question:
   {
     "id": "q1",
     "question": "...",
     "type": "select|radio|text|number|checkbox|date",
     "options": [...] si applicable,
     "maps_to": champ client optionnel (confirmed_budget, desired_unit_types, interest_level, payment_method, address),
     "conditions": [
       { "if": "reponse_specifique", "then_say": "ce que l'agent dit si le client repond ca" },
       { "if": "autre_reponse", "then_say": "reponse alternative" },
       { "if_default": true, "then_say": "reponse par defaut si aucune condition ne matche" }
     ]
   }
   IMPORTANT: Chaque question DOIT avoir des conditions. Si le client refuse de repondre (budget, timing...), la condition doit guider l'agent vers une alternative.
3. "talking_points": array de 3-4 arguments de vente adaptes au profil et au playbook
4. "outro": texte de conclusion avec phrase de closing du playbook. L'objectif est TOUJOURS d'obtenir une date de visite.
5. "suggested_action": prochaine action recommandee (ex: "Planifier visite mardi 10h")

REPONDS UNIQUEMENT avec le JSON, pas de texte autour.`

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiResponse.ok) {
      console.error('AI error:', aiResponse.status)
      return json({ error: 'AI generation failed' }, 502)
    }

    const aiData = await aiResponse.json()
    const text = aiData.content?.[0]?.text ?? ''

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return json({ error: 'Invalid AI response' }, 502)

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
