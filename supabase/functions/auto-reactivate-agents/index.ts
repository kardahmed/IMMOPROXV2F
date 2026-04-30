// auto-reactivate-agents — hourly cron.
//
// Phase 9. When an admin puts an agent "on_leave" via the AgentsPage,
// they pick a return date (leave_ends_at). The agent stays
// status='on_leave' until either an admin manually flips them back,
// or this cron crosses their return date and does it for them.
//
// Without the auto-flip, agencies would forget to reactivate someone
// after their vacation, leaving them excluded from round-robin and
// touchpoints indefinitely. Cron runs at :30 every hour (set by
// migration 049) — granularity of an hour is fine for this kind of
// HR signal.
//
// What it does on each tick:
//   1. SELECT users WHERE status='on_leave' AND leave_ends_at <= NOW()
//   2. UPDATE → status='active', null out the leave window + backup
//   3. Insert an audit_logs row per user so the change is traceable
//
// Auth: scheduled via pg_cron's call_edge_function() helper which
// passes the service-role JWT. requireServiceRole() rejects anything
// else.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceRole } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const guard = requireServiceRole(req)
  if (guard) return guard

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const nowIso = new Date().toISOString()

  // 1. Find all on_leave users whose return date has passed.
  const { data: dueUsers, error: selErr } = await supabase
    .from('users')
    .select('id, tenant_id, first_name, last_name, leave_ends_at, leave_reason')
    .eq('status', 'on_leave')
    .lte('leave_ends_at', nowIso)

  if (selErr) {
    console.error('[auto-reactivate-agents] select error', selErr)
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!dueUsers || dueUsers.length === 0) {
    return new Response(JSON.stringify({ reactivated: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Bulk reactivate. Single UPDATE per row to keep the audit trail
  //    simple — these are HR events that happen <10 per day even on a
  //    busy tenant, no batching needed.
  let reactivated = 0
  for (const user of dueUsers) {
    const { error: updErr } = await supabase
      .from('users')
      .update({
        status: 'active',
        leave_starts_at: null,
        leave_ends_at: null,
        backup_agent_id: null,
        leave_reason: null,
      } as never)
      .eq('id', user.id)

    if (updErr) {
      console.error('[auto-reactivate-agents] update failed', user.id, updErr)
      continue
    }

    // 3. Audit trail — drop a row in audit_logs if the table exists,
    //    otherwise just log to stdout.
    await supabase
      .from('audit_logs')
      .insert({
        tenant_id: user.tenant_id,
        actor_id: null,        // automated
        target_type: 'user',
        target_id: user.id,
        action: 'agent_auto_reactivated',
        metadata: {
          first_name: user.first_name,
          last_name: user.last_name,
          leave_ends_at: user.leave_ends_at,
          leave_reason: user.leave_reason,
        },
      } as never)
      .then(() => undefined, () => undefined)  // ignore if table missing

    reactivated++
  }

  return new Response(JSON.stringify({ reactivated, processed: dueUsers.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
