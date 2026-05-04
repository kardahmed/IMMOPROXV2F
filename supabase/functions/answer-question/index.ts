// answer-question — handles inbound objections during a call
//
// During a call, the client says things like "c'est cher", "je vais
// réfléchir", "et la livraison ?", "y a-t-il un parking ?". The agent
// types the question into the script panel, and this function returns
// a 1-3 sentence professional response the agent can read aloud.
//
// Tuned for B2C real-estate context (agence immobilière algérienne):
//   - Acknowledge the objection (don't dismiss).
//   - Offer concrete next-step or reframe (visite, simulation, comparatif).
//   - Stay French, no emojis, no English filler.
//
// Auth: regular tenant user JWT. Gated on the same `ai_scripts` plan
// feature as generate-call-script — if you can fetch the script, you
// can ask the model objection follow-ups during the call.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkPlanFeature } from '../_shared/checkPlanFeature.ts'
import { trackAnthropicCost } from '../_shared/trackCost.ts'
import { checkQuota, quotaErrorResponse } from '../_shared/checkQuota.ts'
import { sanitizeForPrompt, wrapUntrusted } from '../_shared/promptSanitize.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

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

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    const tenantId = (profile as { tenant_id: string } | null)?.tenant_id
    if (!tenantId) return json({ error: 'No tenant' }, 403)

    const featureCheck = await checkPlanFeature(supabase, tenantId, 'ai_scripts')
    if (!featureCheck.allowed) {
      return json({
        error: featureCheck.reason === 'plan'
          ? `Les réponses IA aux objections ne sont pas incluses dans votre plan (${featureCheck.plan}).`
          : `Les réponses IA aux objections ont été désactivées par l'administrateur de votre agence.`,
        reason: featureCheck.reason,
        plan: featureCheck.plan,
      }, 403)
    }

    const { question, client_stage, client_name } = await req.json()
    if (!question || typeof question !== 'string') {
      return json({ error: 'question required' }, 400)
    }

    if (!anthropicKey) {
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    const quota = await checkQuota(supabase, tenantId, 'anthropic')
    if (!quota.allowed) return quotaErrorResponse(quota, corsHeaders)

    // Pull tenant's agency name + an interested project for grounding —
    // so the response can reference "notre projet X" rather than vague
    // generic phrasing.
    const [tenantRes, projectRes] = await Promise.all([
      supabase.from('tenants').select('name').eq('id', tenantId).single(),
      supabase.from('projects').select('name, location').eq('tenant_id', tenantId).eq('status', 'active').limit(1).maybeSingle(),
    ])
    const agencyName = (tenantRes.data as { name?: string } | null)?.name ?? 'notre agence'
    const projectName = (projectRes.data as { name?: string } | null)?.name ?? null
    const projectLoc = (projectRes.data as { location?: string } | null)?.location ?? null

    const systemPrompt = `Tu es un agent immobilier sénior en Algérie travaillant chez ${agencyName}. Tu aides un agent en appel à répondre à une objection ou question d'un client.

Contexte:
- Le client s'appelle ${client_name ?? '(non précisé)'}
- Étape du pipeline du client: ${client_stage ?? 'inconnue'}
${projectName ? `- Projet phare de l'agence: ${projectName}${projectLoc ? ` à ${projectLoc}` : ''}` : ''}

Règles strictes:
1. Réponse en français professionnel, ton de conseiller, pas de tutoiement client.
2. Maximum 3 phrases courtes — l'agent va lire à voix haute.
3. Reconnais l'objection avant de la traiter (ex: "Je comprends...").
4. Termine par une question ouverte ou une proposition concrète (visite, simulation, RDV).
5. Pas d'emojis, pas de listes à puces, pas de balises markdown.
6. Si la question demande un chiffre précis que tu n'as pas (ex: prix exact, nb de m²), oriente vers une vérification avec l'agent: "Laissez-moi vérifier ce point précis et je vous reviens dans la journée."

Question/objection du client: "${question}"

Réponds UNIQUEMENT avec le texte que l'agent doit dire, rien d'autre.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: wrapUntrusted('QUESTION_CLIENT', sanitizeForPrompt(question, 500)) }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[answer-question] Anthropic error', response.status, errText)
      return json({ error: 'AI service error' }, 502)
    }

    const data = await response.json()
    const answer = (data.content?.[0]?.text ?? '').trim()
    if (!answer) {
      return json({ error: 'Empty response from AI' }, 502)
    }

    await trackAnthropicCost(supabase, data.usage, {
      tenantId,
      operation: 'answer-question',
      metadata: { model: data.model ?? 'claude-haiku-4-5-20251001' },
    })

    return json({ answer })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[answer-question] fatal', msg)
    return json({ error: 'Internal server error' }, 500)
  }
})
