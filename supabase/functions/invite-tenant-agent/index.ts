import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_ROLES = new Set(['admin', 'agent'])

function bad(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return bad(401, 'Missing authorization')

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !caller) return bad(401, 'Invalid token')

    // Caller must be an admin (or super_admin) of an existing tenant.
    // tenant_id is read from the DB, NEVER from the request body — that's
    // the single source of truth that prevents an admin from inviting an
    // agent into someone else's tenant.
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('tenant_id, role, status')
      .eq('id', caller.id)
      .single()
    if (profileErr || !callerProfile) return bad(403, 'Caller profile not found')
    if (callerProfile.status !== 'active') return bad(403, 'Caller account is not active')
    if (!['admin', 'super_admin'].includes(callerProfile.role)) {
      return bad(403, 'Forbidden: tenant admin only')
    }
    if (!callerProfile.tenant_id) return bad(403, 'Caller has no tenant')

    const tenantId = callerProfile.tenant_id

    const body = await req.json() as {
      first_name?: string
      last_name?: string
      email?: string
      phone?: string
      role?: 'admin' | 'agent'
    }
    const { first_name, last_name, email, phone, role = 'agent' } = body

    if (!first_name?.trim() || !last_name?.trim()) return bad(400, 'Prenom et nom requis')
    if (!email || !EMAIL_RE.test(email)) return bad(400, 'Email invalide')
    if (!VALID_ROLES.has(role)) return bad(400, 'Role doit etre admin ou agent')

    const cleanEmail = email.trim().toLowerCase()

    // Pre-flight: email not already used by another user in any tenant.
    // We surface a generic message to limit account enumeration even
    // though the caller is already authenticated as an admin.
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .limit(1)
    if ((existing ?? []).length > 0) {
      return bad(409, 'Cet email est deja utilise par un autre utilisateur')
    }

    const { data: authUser, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      cleanEmail,
      { data: { tenant_id: tenantId, role, first_name: first_name.trim() } },
    )
    if (inviteErr || !authUser?.user) {
      console.error('[invite-tenant-agent] invite failed:', inviteErr)
      return bad(500, "L'invitation n'a pas pu etre envoyee. Reessayez dans un instant.")
    }

    // Insert profile. Roll back the auth user if this fails — otherwise
    // we'd leave an orphaned auth user that blocks future invites for
    // the same email.
    const { error: userErr } = await supabaseAdmin.from('users').insert({
      id: authUser.user.id,
      tenant_id: tenantId,
      first_name: first_name.trim(),
      last_name:  last_name.trim(),
      email:      cleanEmail,
      phone:      phone?.trim() || null,
      role,
      status:     'active',
    })
    if (userErr) {
      console.error('[invite-tenant-agent] profile insert failed:', userErr)
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id).catch(() => {})
      return bad(500, `Creation du profil echouee: ${userErr.message}`)
    }

    return new Response(JSON.stringify({
      user_id: authUser.user.id,
      email: cleanEmail,
      role,
      invite_sent: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[invite-tenant-agent] fatal:', msg)
    return bad(500, 'Internal server error')
  }
})
