// Shared lookup: communication channel → lucide icon. Used by every
// list/card that renders task or message rows.
//
// Pre-factor the same Record was inlined in TasksPage.tsx and
// ClientTasksTab.tsx. Adding a new channel (e.g. 'in_person',
// 'internal') meant updating both files. Centralised so the next
// channel addition is a one-line change.

import { Phone, MessageCircle, Mail, Zap, Users, ClipboardList } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const CHANNEL_ICONS: Record<string, LucideIcon> = {
  whatsapp: MessageCircle,
  sms: Mail,
  call: Phone,
  email: Mail,
  in_person: Users,
  internal: ClipboardList,
  system: Zap,
}

export function channelIcon(channel: string | null | undefined): LucideIcon {
  return CHANNEL_ICONS[channel ?? ''] ?? Zap
}
