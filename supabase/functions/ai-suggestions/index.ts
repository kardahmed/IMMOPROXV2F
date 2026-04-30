import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkPlanFeature } from '../_shared/checkPlanFeature.ts'
import { trackAnthropicCost } from '../_shared/trackCost.ts'
import { checkQuota, quotaErrorResponse } from '../_shared/checkQuota.ts'
import { getGlobalPlaybook } from '../_shared/getGlobalPlaybook.ts'
import { sanitizeObject, wrapUntrusted } from '../_shared/promptSanitize.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify user JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })

    // Validate the JWT by getting the user
    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve tenant + feature gate
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    const tenantId = (profile as { tenant_id: string } | null)?.tenant_id
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'No tenant' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const featureCheck = await checkPlanFeature(supabase, tenantId, 'ai_suggestions')
    if (!featureCheck.allowed) {
      return new Response(JSON.stringify({
        error: featureCheck.reason === 'plan'
          ? `Les suggestions IA ne sont pas incluses dans votre plan (${featureCheck.plan}).`
          : `Les suggestions IA ont été désactivées par l'administrateur de votre agence.`,
        reason: featureCheck.reason,
        plan: featureCheck.plan,
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse request body
    const { clientProfile, unitsList } = await req.json()

    if (!clientProfile || !unitsList || !Array.isArray(unitsList)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Quota check — block if monthly cap or hourly burst is exhausted.
    const quota = await checkQuota(supabase, tenantId, 'anthropic')
    if (!quota.allowed) return quotaErrorResponse(quota, corsHeaders)

    // 3b. Inject the global playbook (founder's expertise) into the system prompt.
    const playbookPrompt = await getGlobalPlaybook(supabase)
    const baseSystem = 'Tu es un expert immobilier algerien. Classe ces unites selon leur adequation avec le profil client. Criteres : budget, type souhaite, rapport qualite/prix, etage, surface. Reponds UNIQUEMENT avec un JSON array : [{"unit_id":"...","rank":1},...]'
    const systemPrompt = playbookPrompt
      ? `${playbookPrompt}\n\n---\n\n${baseSystem}`
      : baseSystem

    // 4. Call Anthropic API server-side
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            wrapUntrusted('PROFIL_CLIENT', JSON.stringify(sanitizeObject(clientProfile, 400))),
            wrapUntrusted('UNITES_DISPONIBLES', JSON.stringify(sanitizeObject(unitsList, 400))),
          ].join('\n\n'),
        }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''

    await trackAnthropicCost(supabase, data.usage, {
      tenantId,
      operation: 'ai-suggestions',
      metadata: { model: data.model ?? 'claude-haiku-4-5-20251001' },
    })

    // 4. Parse ranking from response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Invalid AI response format' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ranking = JSON.parse(jsonMatch[0])

    return new Response(JSON.stringify({ ranking }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal error:', msg)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
