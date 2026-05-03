// Visual map for the unified Planning calendar.
//
// Each PlanEventType resolves to a coherent {label, icon, accent
// classes} bundle. The calendar renders dozens of pills per cell, so
// agents need to glance once and tell apart a visit from a payment
// échéance from a réservation about to expire — colour + icon do that
// without forcing a tooltip.
//
// Convention:
//   • border-l-2 colour = nature of the event (visit / call / payment …)
//   • bg tint    = same family but 10% opacity, so dense days stay readable
//   • icon       = lucide glyph mapped one-to-one with the type
//   • label      = short FR label rendered in the legend / chip filter
//
// Agent avatar colour is computed separately by `nameToColor` so the
// agent dimension layers cleanly on top of the type dimension.
//
// `urgencyTint(at, status)` returns an extra ring class when the event
// is past-due — used by payment_due (status='late') and reservation_
// expires (within 24h) to flag what the agent must touch first.

import {
  CalendarDays, Phone, MessageCircle, Mail, Users,
  ClipboardList, DollarSign, Clock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PlanEventType } from './planningEvents'

interface EventVisual {
  label: string
  icon: LucideIcon
  /** Tailwind text colour for the icon + accent. */
  text: string
  /** Tailwind border colour for the left bar on the pill. */
  border: string
  /** Tailwind bg tint for the pill background. */
  bg: string
  /** Hex for inline SVG / status-badge consumers. */
  hex: string
}

export const EVENT_VISUALS: Record<PlanEventType, EventVisual> = {
  visit: {
    label: 'Visite',
    icon: CalendarDays,
    text: 'text-immo-accent-green',
    border: 'border-l-immo-accent-green',
    bg: 'bg-immo-accent-green/10',
    hex: '#00D4A0',
  },
  task_call: {
    label: 'Appel',
    icon: Phone,
    text: 'text-immo-accent-blue',
    border: 'border-l-immo-accent-blue',
    bg: 'bg-immo-accent-blue/10',
    hex: '#3782FF',
  },
  task_whatsapp: {
    label: 'WhatsApp',
    icon: MessageCircle,
    text: 'text-[#25D366]',
    border: 'border-l-[#25D366]',
    bg: 'bg-[#25D366]/10',
    hex: '#25D366',
  },
  task_email: {
    label: 'Email',
    icon: Mail,
    text: 'text-blue-400',
    border: 'border-l-blue-400',
    bg: 'bg-blue-400/10',
    hex: '#A855F7',
  },
  task_in_person: {
    label: 'Rencontre',
    icon: Users,
    text: 'text-cyan-400',
    border: 'border-l-cyan-400',
    bg: 'bg-cyan-400/10',
    hex: '#06B6D4',
  },
  task_internal: {
    label: 'Tâche',
    icon: ClipboardList,
    text: 'text-immo-text-secondary',
    border: 'border-l-immo-text-muted',
    bg: 'bg-immo-text-muted/10',
    hex: '#7F96B7',
  },
  payment_due: {
    label: 'Paiement',
    icon: DollarSign,
    text: 'text-immo-status-orange',
    border: 'border-l-immo-status-orange',
    bg: 'bg-immo-status-orange/10',
    hex: '#FF9A1E',
  },
  reservation_expires: {
    label: 'Réservation',
    icon: Clock,
    text: 'text-immo-status-red',
    border: 'border-l-immo-status-red',
    bg: 'bg-immo-status-red/10',
    hex: '#FF4949',
  },
}

/** Extra urgency ring when the event is past-due / about to expire. */
export function urgencyRing(
  type: PlanEventType,
  at: string,
  metaStatus?: string,
): string {
  const now = Date.now()
  const evtMs = new Date(at).getTime()

  if (type === 'payment_due' && metaStatus === 'late') {
    return 'ring-1 ring-immo-status-red/50'
  }
  if (type === 'reservation_expires' && evtMs - now < 24 * 3600 * 1000) {
    return 'ring-1 ring-immo-status-red/50'
  }
  return ''
}
