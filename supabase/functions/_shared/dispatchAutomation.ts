// dispatchAutomation — the dual-mode helper that powers every cron + trigger
// in the IMMO PRO-X automation engine.
//
// Strategy:
//   1. Look up the tenant's WhatsApp Business account (whatsapp_accounts).
//   2. If it's active (plan Pro + not over quota) → invoke the send-whatsapp
//      Edge Function with the template + variables. The template arrives
//      on the client's WhatsApp automatically.
//   3. Otherwise (plan Essentiel or WhatsApp inactive) → insert a row into
//      tasks with automation_type + template_params, so the agent sees a
//      nudge in /tasks and can click "Send WhatsApp" to open wa.me on their
//      phone with the pre-filled message.
//
// This way both plans benefit from the automation engine:
//   - Essentiel: CRM reminds the agent WHAT to do + WHEN. Manual execution.
//   - Pro: CRM does the send itself, agent's hands stay free.
//
// The caller (a cron, a database trigger, a manual UI action) doesn't need
// to know which path was taken. It just calls dispatch() and moves on.
//
// Usage (from a Supabase Edge Function):
//
//   import { dispatchAutomation } from '../_shared/dispatchAutomation.ts'
//
//   await dispatchAutomation({
//     supabase,
//     tenantId: '...',
//     clientId: '...',
//     agentId: '...',
//     templateName: 'visite_confirmation_j_moins_1',
//     // Variables are an ORDERED list matching the sample order in
//     // WHATSAPP_TEMPLATES_CATALOG.md — {{1}}, {{2}}, {{3}}, ...
//     templateParams: [
//       'Youcef Mansouri',
//       'mardi 26 mai 2026',
//       '14h00',
//       'Projet Oran Plage, Bt B, Lot A-23',
//       'Ali Ahmed - 0555 11 22 33',
//     ],
//     clientPhone: '+213555112233',  // to field when path = whatsapp
//     // Fallback task fields — only used when path = task.
//     fallbackTaskTitle: 'Envoyer WhatsApp de confirmation visite a Youcef Mansouri',
//     fallbackDueAt: new Date('2026-05-25T09:00:00Z'),
//     // Idempotency key — crons pass a stable value (e.g. visit_id) so
//     // re-runs of the same cron tick don't create duplicate tasks or
//     // send duplicate messages.
//     relatedId: visit.id,
//     relatedType: 'visit',
//     triggerSource: 'cron_check_reminders',
//   })
//
// Return shape:
//   { path: 'whatsapp', messageId: 'wamid...' }
//   { path: 'task', taskId: 'uuid...' }
//   { path: 'skipped', reason: 'duplicate' | 'missing_phone' }

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type DispatchResult =
  | { path: 'whatsapp'; messageId: string | null }
  | { path: 'task'; taskId: string }
  | { path: 'skipped'; reason: 'duplicate' | 'missing_phone' | 'quota_exceeded' | 'whatsapp_error'; details?: string }

export type DispatchInput = {
  supabase: SupabaseClient
  tenantId: string
  clientId: string | null
  agentId: string | null
  templateName: string
  templateParams: string[]
  clientPhone: string | null
  fallbackTaskTitle: string
  fallbackDueAt: Date
  relatedId: string
  relatedType: 'visit' | 'reservation' | 'payment' | 'document' | 'client'
  triggerSource: string  // e.g. 'cron_check_reminders', 'cron_check_payments', 'manual_admin', 'trigger_stage_change'
}

export async function dispatchAutomation(input: DispatchInput): Promise<DispatchResult> {
  const {
    supabase, tenantId, clientId, agentId,
    templateName, templateParams, clientPhone,
    fallbackTaskTitle, fallbackDueAt,
    relatedId, relatedType, triggerSource,
  } = input

  // --- Idempotency check ---
  // If a task with the same (tenant, automation_type, related_id) already
  // exists and isn't done, skip. Crons re-run every N minutes; without this
  // they'd spam tasks.
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('automation_type', templateName)
    .eq('automation_metadata->>related_id', relatedId)
    .is('deleted_at', null)
    .in('status', ['pending', 'in_progress'])
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { path: 'skipped', reason: 'duplicate' }
  }

  // --- Check if tenant has active WhatsApp ---
  const { data: wa } = await supabase
    .from('whatsapp_accounts')
    .select('phone_number_id, access_token, messages_sent, monthly_quota')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  const whatsappAvailable = wa
    && wa.phone_number_id
    && wa.access_token
    && (wa.messages_sent ?? 0) < (wa.monthly_quota ?? 0)

  // --- Path A: send via WhatsApp ---
  if (whatsappAvailable) {
    if (!clientPhone) {
      return { path: 'skipped', reason: 'missing_phone' }
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          to: clientPhone,
          template_name: templateName,
          variables: templateParams,
          client_id: clientId,
        },
      })

      if (error) {
        // WhatsApp send failed (network, quota, template not approved…).
        // Fall through to the task path so the agent at least sees the
        // nudge and can handle it manually.
        console.error('[dispatchAutomation] send-whatsapp failed, falling back to task:', error.message)
        return await insertTask({
          supabase, tenantId, clientId, agentId,
          templateName, templateParams,
          title: fallbackTaskTitle, dueAt: fallbackDueAt,
          relatedId, relatedType, triggerSource,
          fallbackReason: `whatsapp_error: ${error.message}`,
        })
      }

      return { path: 'whatsapp', messageId: (data?.message_id as string | null) ?? null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[dispatchAutomation] send-whatsapp threw:', msg)
      return await insertTask({
        supabase, tenantId, clientId, agentId,
        templateName, templateParams,
        title: fallbackTaskTitle, dueAt: fallbackDueAt,
        relatedId, relatedType, triggerSource,
        fallbackReason: `whatsapp_threw: ${msg}`,
      })
    }
  }

  // --- Path B: fall back to task ---
  return await insertTask({
    supabase, tenantId, clientId, agentId,
    templateName, templateParams,
    title: fallbackTaskTitle, dueAt: fallbackDueAt,
    relatedId, relatedType, triggerSource,
  })
}

// ----------------------------------------
// Internal — shared task insertion
// ----------------------------------------
async function insertTask(params: {
  supabase: SupabaseClient
  tenantId: string
  clientId: string | null
  agentId: string | null
  templateName: string
  templateParams: string[]
  title: string
  dueAt: Date
  relatedId: string
  relatedType: string
  triggerSource: string
  fallbackReason?: string
}): Promise<DispatchResult> {
  const metadata: Record<string, unknown> = {
    related_id: params.relatedId,
    related_type: params.relatedType,
    trigger_source: params.triggerSource,
  }
  if (params.fallbackReason) metadata.fallback_reason = params.fallbackReason

  const { data, error } = await params.supabase
    .from('tasks')
    .insert({
      tenant_id: params.tenantId,
      client_id: params.clientId,
      agent_id: params.agentId,
      title: params.title,
      due_at: params.dueAt.toISOString(),
      status: 'pending',
      type: 'automation',
      automation_type: params.templateName,
      automation_metadata: metadata,
      template_name: params.templateName,
      template_params: params.templateParams,
    } as never)
    .select('id')
    .single()

  if (error) {
    console.error('[dispatchAutomation] task insert failed:', error.message)
    throw new Error(`Failed to insert automation task: ${error.message}`)
  }

  return { path: 'task', taskId: (data as { id: string }).id }
}
