import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify caller is super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify JWT and get user
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check super_admin role
    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: super_admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse request
    const body = await req.json()
    const { tenant, admin } = body as {
      tenant: {
        name: string
        email: string
        phone?: string
        address?: string
        wilaya?: string
        website?: string
      }
      admin: {
        first_name: string
        last_name: string
        email: string
      }
    }

    if (!tenant?.name || !tenant?.email || !admin?.first_name || !admin?.last_name || !admin?.email) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Create tenant
    const { data: newTenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone ?? null,
        address: tenant.address ?? null,
        wilaya: tenant.wilaya ?? null,
        website: tenant.website ?? null,
      })
      .select()
      .single()

    if (tenantErr) {
      console.error('Tenant creation error:', tenantErr)
      return new Response(JSON.stringify({ error: `Tenant creation failed: ${tenantErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Create default tenant_settings
    await supabaseAdmin.from('tenant_settings').insert({
      tenant_id: newTenant.id,
      urgent_alert_days: 7,
      relaunch_alert_days: 3,
      reservation_duration_days: 30,
      min_deposit_amount: 0,
    })

    // 5. Create 3 default document templates
    const templateTypes = ['contrat_vente', 'echeancier', 'bon_reservation']
    for (const type of templateTypes) {
      await supabaseAdmin.from('document_templates').insert({
        tenant_id: newTenant.id,
        type,
        content: '',
      })
    }

    // 6. Invite admin user via Supabase Auth
    const { data: authUser, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      admin.email,
      { data: { tenant_id: newTenant.id, role: 'admin' } }
    )

    if (inviteErr) {
      console.error('Invite error:', inviteErr)
      // Cleanup: delete tenant if user invite fails
      await supabaseAdmin.from('tenants').delete().eq('id', newTenant.id)
      return new Response(JSON.stringify({ error: `User invite failed: ${inviteErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 7. Insert user profile
    const { error: userErr } = await supabaseAdmin.from('users').insert({
      id: authUser.user.id,
      tenant_id: newTenant.id,
      first_name: admin.first_name,
      last_name: admin.last_name,
      email: admin.email,
      role: 'admin',
      status: 'active',
    })

    if (userErr) {
      console.error('User profile error:', userErr)
    }

    // 8. Log super_admin action
    await supabaseAdmin.from('super_admin_logs').insert({
      super_admin_id: caller.id,
      action: 'create_tenant',
      tenant_id: newTenant.id,
      details: {
        tenant_name: tenant.name,
        admin_email: admin.email,
      },
    })

    return new Response(JSON.stringify({
      tenant: newTenant,
      admin_email: admin.email,
      invite_sent: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal error:', msg)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
