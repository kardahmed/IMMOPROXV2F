import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Action = 'create_user' | 'update_role' | 'toggle_status' | 'reset_password' | 'delete_user'

interface RequestBody {
  action: Action
  tenant_id: string
  user_id?: string
  // create_user
  first_name?: string
  last_name?: string
  email?: string
  role?: 'admin' | 'agent'
  // update_role
  new_role?: 'admin' | 'agent'
  // toggle_status
  new_status?: 'active' | 'inactive'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // 1. Verify caller is super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !caller) return json({ error: 'Invalid token' }, 401)

    const { data: callerProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'super_admin') {
      return json({ error: 'Forbidden: super_admin only' }, 403)
    }

    // 2. Parse body
    const body = await req.json() as RequestBody
    const { action, tenant_id, user_id } = body

    if (!action || !tenant_id) return json({ error: 'Missing action or tenant_id' }, 400)

    // Helper: log action
    async function log(actionName: string, details: Record<string, unknown>) {
      await supabase.from('super_admin_logs').insert({
        super_admin_id: caller!.id,
        action: actionName,
        tenant_id,
        details,
      })
    }

    // 3. Handle actions
    switch (action) {
      // ─── CREATE USER ───
      case 'create_user': {
        const { first_name, last_name, email, role } = body
        if (!first_name || !last_name || !email || !role) {
          return json({ error: 'Missing required fields for create_user' }, 400)
        }
        if (!['admin', 'agent'].includes(role)) {
          return json({ error: 'Role must be admin or agent' }, 400)
        }

        // Audit (HIGH): inviteUserByEmail leaks "User already
        // registered" which lets an attacker enumerate accounts.
        // Always return a generic message and a fixed status to
        // hide the difference.
        const { data: authUser, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
          email,
          { data: { tenant_id, role } }
        )
        if (inviteErr) {
          console.error('[manage-user] invite failed:', inviteErr.message)
          return json({ error: 'Invitation could not be sent. The email may already be registered.' }, 400)
        }

        // Insert profile
        const { error: profileErr } = await supabase.from('users').insert({
          id: authUser.user.id,
          tenant_id,
          first_name,
          last_name,
          email,
          role,
          status: 'active',
        })
        if (profileErr) {
          console.error('Profile insert error:', profileErr)
          return json({ error: `Profile creation failed: ${profileErr.message}` }, 500)
        }

        await log('create_user', { email, role, user_id: authUser.user.id })

        return json({
          user_id: authUser.user.id,
          email,
          role,
          invite_sent: true,
        })
      }

      // ─── UPDATE ROLE ───
      case 'update_role': {
        if (!user_id || !body.new_role) return json({ error: 'Missing user_id or new_role' }, 400)
        if (!['admin', 'agent'].includes(body.new_role)) {
          return json({ error: 'Role must be admin or agent' }, 400)
        }

        // Audit (HIGH): forbid downgrading the LAST admin of a tenant
        // — that would lock the tenant out of any further admin
        // operation. Same protection applies if the action is
        // demoting an admin to agent.
        if (body.new_role === 'agent') {
          const { data: targetUser } = await supabase
            .from('users')
            .select('role')
            .eq('id', user_id)
            .single()
          if ((targetUser as { role?: string } | null)?.role === 'admin') {
            const { count } = await supabase
              .from('users')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenant_id)
              .eq('role', 'admin')
              .eq('status', 'active')
            if ((count ?? 0) <= 1) {
              return json({ error: 'Cannot demote the last active admin of the tenant' }, 409)
            }
          }
        }

        const { error } = await supabase
          .from('users')
          .update({ role: body.new_role })
          .eq('id', user_id)
          .eq('tenant_id', tenant_id)

        if (error) return json({ error: error.message }, 500)

        await log('update_role', { user_id, new_role: body.new_role })
        return json({ success: true, user_id, new_role: body.new_role })
      }

      // ─── TOGGLE STATUS ───
      case 'toggle_status': {
        if (!user_id || !body.new_status) return json({ error: 'Missing user_id or new_status' }, 400)

        const { error } = await supabase
          .from('users')
          .update({ status: body.new_status })
          .eq('id', user_id)
          .eq('tenant_id', tenant_id)

        if (error) return json({ error: error.message }, 500)

        // Also ban/unban in Supabase Auth
        if (body.new_status === 'inactive') {
          await supabase.auth.admin.updateUserById(user_id, { ban_duration: '876000h' }) // ~100 years
        } else {
          await supabase.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
        }

        await log('toggle_status', { user_id, new_status: body.new_status })
        return json({ success: true, user_id, new_status: body.new_status })
      }

      // ─── RESET PASSWORD ───
      case 'reset_password': {
        if (!user_id) return json({ error: 'Missing user_id' }, 400)

        // Get user email
        const { data: userProfile } = await supabase
          .from('users')
          .select('email')
          .eq('id', user_id)
          .eq('tenant_id', tenant_id)
          .single()

        if (!userProfile?.email) return json({ error: 'User not found' }, 404)

        // Send password reset email via Supabase Auth
        const { error } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email: userProfile.email,
        })

        if (error) return json({ error: `Reset failed: ${error.message}` }, 500)

        await log('reset_password', { user_id, email: userProfile.email })
        return json({ success: true, email: userProfile.email })
      }

      // ─── DELETE USER ───
      case 'delete_user': {
        if (!user_id) return json({ error: 'Missing user_id' }, 400)

        // Get email for logging before deletion
        const { data: userProfile } = await supabase
          .from('users')
          .select('email, role')
          .eq('id', user_id)
          .eq('tenant_id', tenant_id)
          .single()

        if (!userProfile) return json({ error: 'User not found' }, 404)

        // Delete from users table first (FK constraints)
        const { error: profileErr } = await supabase
          .from('users')
          .delete()
          .eq('id', user_id)
          .eq('tenant_id', tenant_id)

        if (profileErr) return json({ error: `Delete profile failed: ${profileErr.message}` }, 500)

        // Delete from Supabase Auth
        const { error: authErr2 } = await supabase.auth.admin.deleteUser(user_id)
        if (authErr2) console.error('Auth delete warning:', authErr2)

        await log('delete_user', { user_id, email: userProfile.email, role: userProfile.role })
        return json({ success: true, user_id })
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal error:', msg)
    return json({ error: 'Internal server error' }, 500)
  }
})
