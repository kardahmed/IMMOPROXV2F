import { supabase } from '@/lib/supabase'

export type PlatformEvent =
  | 'client.created'
  | 'client.updated'
  | 'client.stage_changed'
  | 'visit.scheduled'
  | 'visit.completed'
  | 'reservation.created'
  | 'reservation.expired'
  | 'sale.completed'
  | 'payment.received'
  | 'agent.invited'

/**
 * Fire-and-forget event emission to all webhooks of a tenant.
 * Never throws — webhook errors are logged server-side only.
 */
export async function emitEvent(
  tenantId: string | null | undefined,
  eventType: PlatformEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!tenantId) return
  try {
    await supabase.functions.invoke('emit-webhook', {
      body: { tenant_id: tenantId, event_type: eventType, payload },
    })
  } catch {
    // swallow — webhooks are best-effort from the client
  }
}
