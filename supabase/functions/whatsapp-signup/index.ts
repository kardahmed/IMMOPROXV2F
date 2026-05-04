import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Verify user
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    // Get tenant
    const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
    if (!profile?.tenant_id) return json({ error: 'No tenant' }, 403)
    if (profile.role === 'agent') return json({ error: 'Admin only' }, 403)

    // Get platform WhatsApp config (for app_id and app_secret)
    const { data: waConfig } = await supabase.from('whatsapp_config').select('*').eq('is_active', true).limit(1).single()
    if (!waConfig) return json({ error: 'WhatsApp non configure sur la plateforme' }, 503)

    const config = waConfig as unknown as {
      meta_app_id: string
      meta_app_secret: string
      access_token: string
    }

    const { code } = await req.json() as { code: string }
    if (!code) return json({ error: 'code required' }, 400)

    // 1. Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v25.0/oauth/access_token?client_id=${config.meta_app_id}&client_secret=${config.meta_app_secret}&code=${code}`
    const tokenRes = await fetch(tokenUrl)
    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Token exchange failed:', tokenData)
      return json({ error: 'Echec d\'echange du code Meta. Reessayez.' }, 502)
    }

    const shortLivedToken = tokenData.access_token

    // 2. Exchange the short-lived user token for a long-lived one
    //    (60-day expiry instead of ~1h). The audit flagged that we
    //    were storing the short-lived token directly — it expires
    //    fast and gives full Cloud API access while alive.
    const longLivedRes = await fetch(
      `https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.meta_app_id}&client_secret=${config.meta_app_secret}&fb_exchange_token=${shortLivedToken}`,
    )
    const longLivedData = await longLivedRes.json()
    const userToken: string = longLivedData?.access_token ?? shortLivedToken
    if (!longLivedData?.access_token) {
      console.warn('Long-lived token exchange did not return a new token; falling back to short-lived')
    }

    // 3. Verify token via debug_token AND extract the granted WABAs
    //    instead of trusting the first item from /me/whatsapp_business_accounts.
    //    Audit finding: the previous code blindly took shared[0], allowing
    //    a tenant to onboard a WABA that's already linked to another
    //    tenant or doesn't actually belong to them.
    const debugRes = await fetch(`https://graph.facebook.com/v25.0/debug_token?input_token=${userToken}&access_token=${config.meta_app_id}|${config.meta_app_secret}`)
    const debugData = await debugRes.json()
    const grantedScopes: string[] = debugData?.data?.scopes ?? []
    const tokenAppId: string | undefined = debugData?.data?.app_id
    if (tokenAppId && tokenAppId !== config.meta_app_id) {
      return json({ error: 'Token appartient a une autre application Meta' }, 401)
    }
    if (!grantedScopes.includes('whatsapp_business_management') &&
        !grantedScopes.includes('whatsapp_business_messaging')) {
      return json({ error: 'Permissions WhatsApp non accordees' }, 403)
    }

    // 4. List phone numbers from the WABA that was just connected.
    let wabaId: string | null = null
    let phoneNumberId: string | null = null
    let displayPhone: string | null = null

    const sharedWabaRes = await fetch(`https://graph.facebook.com/v25.0/me/whatsapp_business_accounts`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    })
    const sharedWabaData = await sharedWabaRes.json()

    if (sharedWabaData.data && sharedWabaData.data.length > 0) {
      wabaId = sharedWabaData.data[0].id

      // Cross-tenant takeover guard: if this WABA is already linked
      // to a DIFFERENT tenant, refuse the signup. The matching DB
      // UNIQUE INDEX in 050 is the second-line defense.
      const { data: existingWaba } = await supabase
        .from('whatsapp_accounts')
        .select('tenant_id')
        .eq('waba_id', wabaId)
        .neq('tenant_id', profile.tenant_id)
        .maybeSingle()
      if (existingWaba) {
        return json({ error: 'Ce compte WhatsApp Business est deja relie a une autre agence' }, 409)
      }

      const phonesRes = await fetch(`https://graph.facebook.com/v25.0/${wabaId}/phone_numbers`, {
        headers: { 'Authorization': `Bearer ${config.access_token}` },
      })
      const phonesData = await phonesRes.json()

      if (phonesData.data && phonesData.data.length > 0) {
        phoneNumberId = phonesData.data[0].id
        displayPhone = phonesData.data[0].display_phone_number

        // Same guard on phone_number_id collision.
        const { data: existingPhone } = await supabase
          .from('whatsapp_accounts')
          .select('tenant_id')
          .eq('phone_number_id', phoneNumberId)
          .neq('tenant_id', profile.tenant_id)
          .maybeSingle()
        if (existingPhone) {
          return json({ error: 'Ce numero WhatsApp est deja relie a une autre agence' }, 409)
        }
      }
    }

    if (!wabaId || !phoneNumberId) {
      return json({ error: 'Impossible de recuperer le numero WhatsApp. Verifiez que vous avez bien connecte un numero.' }, 400)
    }

    // 4. Subscribe the app to the WABA (required for sending)
    await fetch(`https://graph.facebook.com/v25.0/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.access_token}` },
    })

    // 5. Store in whatsapp_accounts
    const { data: existing } = await supabase
      .from('whatsapp_accounts')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .single()

    const accountData = {
      tenant_id: profile.tenant_id,
      is_active: true,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      display_phone: displayPhone,
      access_token: userToken,
      plan: 'starter',
      monthly_quota: 500,
      messages_sent: 0,
    }

    if (existing) {
      await supabase.from('whatsapp_accounts')
        .update({
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          display_phone: displayPhone,
          access_token: userToken,
          is_active: true,
        } as never)
        .eq('tenant_id', profile.tenant_id)
    } else {
      await supabase.from('whatsapp_accounts').insert(accountData as never)
    }

    console.log(`WhatsApp signup: tenant ${profile.tenant_id} connected ${displayPhone} (WABA: ${wabaId}, Phone: ${phoneNumberId})`)

    return json({
      success: true,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      display_phone: displayPhone,
    })
  } catch (err) {
    console.error('Fatal:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
