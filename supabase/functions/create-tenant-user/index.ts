import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_PLANS = new Set(['free', 'starter', 'pro', 'enterprise'])

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
    // 1. Auth: super_admin only
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return bad(401, 'Missing authorization')

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      // Pass the caller's JWT through so the SECURITY DEFINER RPCs can
      // re-verify auth.uid() = the super-admin who clicked the button.
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !caller) return bad(401, 'Invalid token')

    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single()
    if (callerProfile?.role !== 'super_admin') {
      return bad(403, 'Forbidden: super_admin only')
    }

    // 2. Parse + validate input
    const body = await req.json()
    const { tenant, admin, plan = 'starter', trial_days = 14 } = body as {
      tenant: { name: string; email: string; phone?: string; address?: string; wilaya?: string; website?: string }
      admin:  { first_name: string; last_name: string; email: string }
      plan?:  string
      trial_days?: number
    }

    if (!tenant?.name?.trim()) return bad(400, 'Tenant name required')
    if (!tenant?.email || !EMAIL_RE.test(tenant.email)) return bad(400, 'Tenant email invalid')
    if (!admin?.first_name?.trim() || !admin?.last_name?.trim()) return bad(400, 'Admin first/last name required')
    if (!admin?.email || !EMAIL_RE.test(admin.email)) return bad(400, 'Admin email invalid')
    if (!VALID_PLANS.has(plan)) return bad(400, `Plan must be one of ${[...VALID_PLANS].join(', ')}`)
    if (typeof trial_days !== 'number' || trial_days < 0 || trial_days > 365) {
      return bad(400, 'trial_days must be between 0 and 365')
    }

    // 3. Pre-flight uniqueness checks (P2)
    // a) Admin email already used by another auth user?
    const { data: existingUsers } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id')
      .eq('email', admin.email)
      .limit(1)
    if ((existingUsers ?? []).length > 0) {
      return bad(409, `Cet email admin (${admin.email}) est deja utilise par un autre utilisateur`)
    }

    // b) Tenant name duplicate? Warning, not fatal — we let the
    //    super-admin keep going if they really mean it (returned in
    //    `warnings` so the UI can surface a confirm).
    const warnings: string[] = []
    const { data: dupName } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .ilike('name', tenant.name.trim())
      .limit(1)
    if ((dupName ?? []).length > 0) {
      warnings.push(`Un tenant avec le nom "${tenant.name.trim()}" existe deja`)
    }

    // 4. Atomic create tenant + settings + templates via RPC (P1)
    const { data: tenantId, error: rpcErr } = await supabaseAdmin.rpc('create_tenant_atomic', {
      p_name:       tenant.name.trim(),
      p_email:      tenant.email.trim().toLowerCase(),
      p_phone:      tenant.phone?.trim() || null,
      p_address:    tenant.address?.trim() || null,
      p_wilaya:     tenant.wilaya?.trim() || null,
      p_website:    tenant.website?.trim() || null,
      p_plan:       plan,
      p_trial_days: trial_days,
    })
    if (rpcErr || !tenantId) {
      console.error('create_tenant_atomic RPC error:', rpcErr)
      return bad(500, `Tenant creation failed: ${rpcErr?.message ?? 'unknown'}`)
    }

    // 5. Invite the admin user. If this fails we rollback the tenant.
    const { data: authUser, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      admin.email.trim().toLowerCase(),
      { data: { tenant_id: tenantId, role: 'admin' } },
    )
    if (inviteErr || !authUser?.user) {
      console.error('Invite error:', inviteErr)
      await supabaseAdmin.rpc('delete_tenant_atomic', { p_tenant_id: tenantId })
      // Generic error, don't leak whether the address is already known to
      // Supabase Auth (per Big-4 audit recommendation).
      return bad(500, "Impossible d'inviter l'administrateur. Verifiez l'adresse email.")
    }

    // 6. Insert the admin user profile. If this fails we rollback both
    //    the tenant AND the auth user we just created — otherwise the
    //    tenant is dangling without an admin AND the auth user is orphaned.
    const { error: userErr } = await supabaseAdmin.from('users').insert({
      id: authUser.user.id,
      tenant_id: tenantId,
      first_name: admin.first_name.trim(),
      last_name:  admin.last_name.trim(),
      email:      admin.email.trim().toLowerCase(),
      role:       'admin',
      status:     'active',
    })
    if (userErr) {
      console.error('User profile error:', userErr)
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id).catch(() => {})
      await supabaseAdmin.rpc('delete_tenant_atomic', { p_tenant_id: tenantId })
      return bad(500, `User profile creation failed: ${userErr.message}`)
    }

    // 7. Audit log (best-effort — failure here doesn't justify a rollback)
    await supabaseAdmin.from('super_admin_logs').insert({
      super_admin_id: caller.id,
      action: 'create_tenant',
      tenant_id: tenantId,
      details: {
        tenant_name: tenant.name,
        admin_email: admin.email,
        plan,
        trial_days,
      },
    }).catch(() => {})

    return new Response(JSON.stringify({
      tenant: { id: tenantId, name: tenant.name, plan, trial_days },
      admin_email: admin.email,
      invite_sent: true,
      warnings,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal error:', msg)
    return bad(500, 'Internal server error')
  }
})
