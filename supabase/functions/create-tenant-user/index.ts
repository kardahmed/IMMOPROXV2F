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

    // Two clients with deliberately different auth contexts:
    //
    //   supabaseAdmin: pure service_role. Used for auth.admin APIs
    //     (inviteUserByEmail) which require the service-role JWT in
    //     the Authorization header — overriding it with the caller's
    //     user JWT triggers a `not_admin` 401 from /auth/v1/admin/...
    //
    //   supabaseAsCaller: service_role key for the apikey, but the
    //     caller's user JWT in Authorization. Used for RPCs that
    //     check auth.uid() to re-verify super_admin server-side
    //     (defense in depth — even if this function leaks, the RPCs
    //     still gate on the caller's role).
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const supabaseAsCaller = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
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
    // Use supabaseAsCaller so auth.uid() inside the SECURITY DEFINER
    // RPC resolves to the super-admin caller (the RPC re-verifies the
    // role itself).
    const { data: tenantId, error: rpcErr } = await supabaseAsCaller.rpc('create_tenant_atomic', {
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
      await supabaseAsCaller.rpc('delete_tenant_atomic', { p_tenant_id: tenantId })
      // Caller is already verified as super_admin (step 1), so it's safe
      // to surface the underlying Supabase Auth error message — they
      // need it to debug. We'd hide this if non-admin users could ever
      // reach this endpoint.
      const detail = inviteErr?.message ?? 'unknown'
      const code = (inviteErr as { code?: string })?.code ?? (inviteErr as { name?: string })?.name ?? ''
      return bad(500, `Auth invite failed [${code}]: ${detail}`)
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
      console.error('[create-tenant-user] User profile insert failed:', userErr)
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id).catch((e) => {
        console.error('[create-tenant-user] auth user rollback failed:', e)
      })
      await supabaseAsCaller.rpc('delete_tenant_atomic', { p_tenant_id: tenantId }).catch((e) => {
        console.error('[create-tenant-user] tenant rollback failed:', e)
      })
      return bad(500, `User profile creation failed: ${userErr.message}`)
    }

    // 7. Audit log (best-effort — failure here doesn't justify a rollback).
    // Wrapped in try/catch on top of the supabase-js error handling because
    // earlier traces showed stray rejections from this insert escaping to
    // the global catch and surfacing as "Internal server error" — which
    // hid the real bug behind a useless message.
    try {
      const { error: logErr } = await supabaseAdmin.from('super_admin_logs').insert({
        super_admin_id: caller.id,
        action: 'create_tenant',
        tenant_id: tenantId,
        details: {
          tenant_name: tenant.name,
          admin_email: admin.email,
          plan,
          trial_days,
        },
      })
      if (logErr) console.warn('[create-tenant-user] audit log insert failed:', logErr)
    } catch (logEx) {
      console.warn('[create-tenant-user] audit log threw:', logEx)
    }

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
    const stack = err instanceof Error ? err.stack : undefined
    console.error('[create-tenant-user] fatal:', msg, stack)
    // Surface the actual failure to the super-admin UI so we can debug
    // without having to grep edge-function logs for every 500.
    return bad(500, `Internal error: ${msg}`)
  }
})
