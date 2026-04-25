// Hourly cron — finds pending tasks where the agent already pinged
// the client (executed_at IS NOT NULL) more than 48 hours ago,
// the client never replied, and creates a follow-up task on a
// different channel. The original is auto-cancelled so it doesn't
// keep showing up in /tasks.
//
// MVP closure plan step C — third leg. Without this cron, tasks
// where the client never replies stay pending forever (the webhook
// only auto-closes ON reply; if there is no reply, nothing closes
// them). Wired by migration 032.
//
// Defensive design:
//   1. Re-check whatsapp_messages for inbound replies since
//      executed_at — if any, the webhook missed closing this task
//      (race condition between webhook insert and our query).
//      Close it as 'done' rather than escalating.
//   2. Cap one relance per original task (auto_cancelled flag on the
//      original prevents the cron from picking it up again).
//   3. Skip soft-deleted tasks.
//   4. Per-batch error isolation: one bad task doesn't fail the run.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const REPLY_WINDOW_HOURS = 48
const MAX_TASKS_PER_RUN = 500

// Channel rotation: try a different channel for the relance. If the
// agent already tried WhatsApp without success, suggest a phone call;
// for any other channel, default to WhatsApp.
function suggestNextChannel(channel: string | null): string {
  switch (channel) {
    case 'whatsapp':
      return 'call'
    case 'call':
    case 'sms':
    case 'email':
      return 'whatsapp'
    default:
      return 'call'
  }
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const cutoff = new Date(Date.now() - REPLY_WINDOW_HOURS * 3600 * 1000).toISOString()

  // Candidate set: pending + executed (sent) + older than 48h + not
  // already auto-cancelled + not soft-deleted.
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, tenant_id, client_id, agent_id, title, channel, executed_at, stage')
    .eq('status', 'pending')
    .not('executed_at', 'is', null)
    .lt('executed_at', cutoff)
    .neq('auto_cancelled', true)
    .is('deleted_at', null)
    .limit(MAX_TASKS_PER_RUN)

  if (error) {
    console.error('[check-tasks-no-reply] candidate query failed:', error)
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const result = {
    candidates: tasks?.length ?? 0,
    closed_after_late_reply: 0,
    relanced: 0,
    errors: [] as string[],
  }

  for (const task of (tasks ?? []) as Array<{
    id: string
    tenant_id: string
    client_id: string | null
    agent_id: string | null
    title: string
    channel: string | null
    executed_at: string
    stage: string | null
  }>) {
    // Defensive: did the client actually reply since we sent? The
    // webhook normally closes the task in that case, but a race could
    // leave it open — re-check before escalating.
    if (task.client_id) {
      const { count: replyCount } = await supabase
        .from('whatsapp_messages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', task.tenant_id)
        .eq('client_id', task.client_id)
        .eq('direction', 'inbound')
        .gte('created_at', task.executed_at)

      if ((replyCount ?? 0) > 0) {
        const { error: lateCloseErr } = await supabase
          .from('tasks')
          .update({
            status: 'done',
            completed_at: new Date().toISOString(),
          } as never)
          .eq('id', task.id)
        if (lateCloseErr) {
          result.errors.push(`Late close ${task.id}: ${lateCloseErr.message}`)
        } else {
          result.closed_after_late_reply++
        }
        continue
      }
    }

    // No reply within the window → cancel original + create relance on
    // a different channel.
    const nextChannel = suggestNextChannel(task.channel)

    const { error: cancelErr } = await supabase
      .from('tasks')
      .update({
        auto_cancelled: true,
        status: 'ignored',
      } as never)
      .eq('id', task.id)

    if (cancelErr) {
      result.errors.push(`Cancel ${task.id}: ${cancelErr.message}`)
      continue
    }

    const { error: createErr } = await supabase.from('tasks').insert({
      tenant_id: task.tenant_id,
      client_id: task.client_id,
      agent_id: task.agent_id,
      title: `Relancer (pas de reponse 48h) - ${task.title}`.slice(0, 200),
      type: 'manual',
      status: 'pending',
      channel: nextChannel,
      priority: 'high',
      stage: task.stage,
    } as never)

    if (createErr) {
      result.errors.push(`Create relance for ${task.id}: ${createErr.message}`)
      continue
    }

    result.relanced++

    if (task.client_id) {
      await supabase.from('history').insert({
        tenant_id: task.tenant_id,
        client_id: task.client_id,
        agent_id: task.agent_id,
        type: 'note',
        title: `Relance auto creee apres 48h sans reponse (${task.channel ?? 'inconnu'} -> ${nextChannel})`,
        metadata: {
          original_task_id: task.id,
          channel_from: task.channel,
          channel_to: nextChannel,
        },
      } as never)
    }
  }

  console.log(
    `[check-tasks-no-reply] ${result.candidates} candidate(s), ${result.closed_after_late_reply} late-closed, ${result.relanced} relanced, ${result.errors.length} error(s)`,
  )
  if (result.errors.length > 0) {
    console.error('[check-tasks-no-reply] errors:', result.errors)
  }

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
