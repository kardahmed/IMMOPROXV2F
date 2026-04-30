// Unified events aggregator for the Planning page (`/planning`).
//
// Pre-Phase-1 the page only rendered `visits`. Agents needed to flip
// between /tasks, /pipeline, /dossiers to know what their day really
// looked like. This hook merges 4 sources into one ordered timeline:
//
//   • visites scheduled (visits.scheduled_at)
//   • tâches scheduled — call / whatsapp / email / in_person /
//     internal (tasks.scheduled_at, only manual + automation rows
//     with a scheduled_at; ad-hoc tasks without a date are skipped)
//   • échéances paiement (payment_schedules.due_date with status
//     pending or late — joined to sales → clients for context)
//   • réservations qui expirent (reservations.expires_at while
//     status='active' — surfaces deadlines the agent must handle)
//
// Each PlanEvent flows through the type/color/icon map in
// eventVisuals so the calendar cells render with consistent colours,
// borders and icons regardless of source.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type PlanEventType =
  | 'visit'
  | 'task_call'
  | 'task_whatsapp'
  | 'task_email'
  | 'task_in_person'
  | 'task_internal'
  | 'payment_due'
  | 'reservation_expires'

export interface PlanEvent {
  id: string
  type: PlanEventType
  /** ISO timestamp the calendar should anchor on. */
  at: string
  title: string
  client_id: string | null
  client_name: string | null
  client_phone: string | null
  agent_id: string | null
  agent_name: string | null
  /** Optional metadata for the manage modal (status, amount, etc). */
  meta?: Record<string, unknown>
}

interface FetchArgs {
  tenantId: string
  rangeStart: string  // 'YYYY-MM-DD'
  rangeEnd: string    // 'YYYY-MM-DD'
  /** Restrict to one agent (set when the caller is an agent). */
  agentId?: string | null
  /** Sub-filter for visits on the existing UI. */
  projectFilter?: string | null
  /** Toggle which sources to include — drives the chip filter. */
  include: {
    visits: boolean
    tasks: boolean
    payments: boolean
    reservations: boolean
  }
}

function taskChannelToType(ch: string | null | undefined): PlanEventType {
  switch (ch) {
    case 'call':       return 'task_call'
    case 'whatsapp':   return 'task_whatsapp'
    case 'email':      return 'task_email'
    case 'in_person':  return 'task_in_person'
    case 'internal':   return 'task_internal'
    default:           return 'task_internal'
  }
}

export function usePlanningEvents(args: FetchArgs) {
  const { tenantId, rangeStart, rangeEnd, agentId, projectFilter, include } = args

  return useQuery<PlanEvent[]>({
    queryKey: [
      'planning-events', tenantId, rangeStart, rangeEnd,
      agentId ?? 'all', projectFilter ?? 'all',
      include.visits, include.tasks, include.payments, include.reservations,
    ],
    enabled: !!tenantId,
    queryFn: async () => {
      const startTs = `${rangeStart}T00:00:00`
      const endTs = `${rangeEnd}T23:59:59`

      // Run the 4 fetches in parallel. Each branch returns an empty
      // array when the toggle is off, so the merged result still holds
      // the shape the calendar expects.
      const [visitsRes, tasksRes, paymentsRes, reservationsRes] = await Promise.all([
        include.visits
          ? (() => {
              let q = supabase
                .from('visits')
                .select('id, client_id, agent_id, scheduled_at, visit_type, status, notes, project_id, tenant_id, clients(full_name, phone, pipeline_stage), users!visits_agent_id_fkey(first_name, last_name)')
                .eq('tenant_id', tenantId)
                .is('deleted_at', null)
                .gte('scheduled_at', startTs)
                .lte('scheduled_at', endTs)
                .order('scheduled_at')
              if (agentId) q = q.eq('agent_id', agentId)
              if (projectFilter && projectFilter !== 'all') q = q.eq('project_id', projectFilter)
              return q
            })()
          : Promise.resolve({ data: [], error: null }),

        include.tasks
          ? (() => {
              let q = supabase
                .from('tasks')
                .select('id, client_id, agent_id, scheduled_at, channel, title, status, clients(full_name, phone), users!tasks_agent_id_fkey(first_name, last_name)')
                .eq('tenant_id', tenantId)
                .is('deleted_at', null)
                .not('scheduled_at', 'is', null)
                .gte('scheduled_at', startTs)
                .lte('scheduled_at', endTs)
                .neq('status', 'ignored')
                .order('scheduled_at')
              if (agentId) q = q.eq('agent_id', agentId)
              return q
            })()
          : Promise.resolve({ data: [], error: null }),

        include.payments
          ? supabase
              .from('payment_schedules')
              .select('id, due_date, amount, status, sales(client_id, agent_id, clients(full_name, phone), users!sales_agent_id_fkey(first_name, last_name))')
              .eq('tenant_id', tenantId)
              .gte('due_date', rangeStart)
              .lte('due_date', rangeEnd)
              .in('status', ['pending', 'late'])
              .order('due_date')
          : Promise.resolve({ data: [], error: null }),

        include.reservations
          ? (() => {
              let q = supabase
                .from('reservations')
                .select('id, client_id, agent_id, expires_at, status, clients(full_name, phone), users!reservations_agent_id_fkey(first_name, last_name)')
                .eq('tenant_id', tenantId)
                .is('deleted_at', null)
                .eq('status', 'active')
                .gte('expires_at', startTs)
                .lte('expires_at', endTs)
                .order('expires_at')
              if (agentId) q = q.eq('agent_id', agentId)
              return q
            })()
          : Promise.resolve({ data: [], error: null }),
      ])

      const events: PlanEvent[] = []

      // --- visits → PlanEvent[type=visit] ---
      for (const row of (visitsRes.data ?? []) as Array<Record<string, unknown>>) {
        const c = row.clients as { full_name?: string; phone?: string; pipeline_stage?: string } | null
        const u = row.users as { first_name?: string; last_name?: string } | null
        events.push({
          id: `visit_${row.id as string}`,
          type: 'visit',
          at: row.scheduled_at as string,
          title: `Visite ${(row.visit_type as string) ?? ''}`.trim(),
          client_id: (row.client_id as string | null) ?? null,
          client_name: c?.full_name ?? null,
          client_phone: c?.phone ?? null,
          agent_id: (row.agent_id as string | null) ?? null,
          agent_name: u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : null,
          meta: {
            status: row.status,
            visit_type: row.visit_type,
            notes: row.notes,
            project_id: row.project_id,
            tenant_id: row.tenant_id,
            pipeline_stage: c?.pipeline_stage,
            raw_id: row.id,
          },
        })
      }

      // --- tasks → PlanEvent[type=task_*] ---
      for (const row of (tasksRes.data ?? []) as Array<Record<string, unknown>>) {
        const c = row.clients as { full_name?: string; phone?: string } | null
        const u = row.users as { first_name?: string; last_name?: string } | null
        events.push({
          id: `task_${row.id as string}`,
          type: taskChannelToType(row.channel as string | null),
          at: row.scheduled_at as string,
          title: (row.title as string) ?? '',
          client_id: (row.client_id as string | null) ?? null,
          client_name: c?.full_name ?? null,
          client_phone: c?.phone ?? null,
          agent_id: (row.agent_id as string | null) ?? null,
          agent_name: u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : null,
          meta: { channel: row.channel, status: row.status, raw_id: row.id },
        })
      }

      // --- payment_schedules → PlanEvent[type=payment_due] ---
      for (const row of (paymentsRes.data ?? []) as Array<Record<string, unknown>>) {
        const sale = row.sales as {
          client_id?: string
          agent_id?: string
          clients?: { full_name?: string; phone?: string }
          users?: { first_name?: string; last_name?: string }
        } | null
        const c = sale?.clients
        const u = sale?.users
        events.push({
          id: `payment_${row.id as string}`,
          type: 'payment_due',
          // Anchor at noon to keep it in the calendar middle band.
          at: `${row.due_date as string}T12:00:00`,
          title: `Échéance ${Number(row.amount).toLocaleString('fr-FR')} DZD`,
          client_id: sale?.client_id ?? null,
          client_name: c?.full_name ?? null,
          client_phone: c?.phone ?? null,
          agent_id: sale?.agent_id ?? null,
          agent_name: u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : null,
          meta: { amount: row.amount, status: row.status, raw_id: row.id },
        })
      }

      // --- reservations → PlanEvent[type=reservation_expires] ---
      for (const row of (reservationsRes.data ?? []) as Array<Record<string, unknown>>) {
        const c = row.clients as { full_name?: string; phone?: string } | null
        const u = row.users as { first_name?: string; last_name?: string } | null
        events.push({
          id: `resv_${row.id as string}`,
          type: 'reservation_expires',
          at: row.expires_at as string,
          title: 'Expiration réservation',
          client_id: (row.client_id as string | null) ?? null,
          client_name: c?.full_name ?? null,
          client_phone: c?.phone ?? null,
          agent_id: (row.agent_id as string | null) ?? null,
          agent_name: u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : null,
          meta: { status: row.status, raw_id: row.id },
        })
      }

      // Sort the merged list chronologically — keeps day-cells stable.
      events.sort((a, b) => a.at.localeCompare(b.at))
      return events
    },
  })
}
