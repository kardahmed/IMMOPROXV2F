import { useTranslation } from 'react-i18next'
import { Inbox, User } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getInitials } from '@/lib/format'
import type { Conversation } from '@/hooks/useInbox'

interface Props {
  conversations: Conversation[]
  selectedKey: string | null
  onSelect: (conv: Conversation) => void
  /** When provided (admin view), each row shows the assigned agent. */
  agentMap?: Map<string, string>
}

function formatPhone(phone: string): string {
  if (!phone) return ''
  return phone.startsWith('+') ? phone : `+${phone}`
}


export function ConversationList({ conversations, selectedKey, onSelect, agentMap }: Props) {
  const { t } = useTranslation()

  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-immo-text-muted">
        <Inbox className="mb-3 h-10 w-10 text-immo-text-muted/40" />
        <p>{t('inbox.empty_list')}</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col">
      {conversations.map((conv) => {
        const label = conv.client?.full_name ?? formatPhone(conv.phone) ?? t('inbox.unknown_sender')
        const isSelected = conv.key === selectedKey
        const subtitle = conv.lastMessage.body_text ?? ''
        const time = formatDistanceToNow(new Date(conv.lastMessageAt), { locale: fr, addSuffix: false })
        const agentName = agentMap && conv.agentId ? agentMap.get(conv.agentId) : null

        return (
          <li key={conv.key}>
            <button
              type="button"
              onClick={() => onSelect(conv)}
              className={`group flex w-full items-start gap-3 border-b border-immo-border-default px-4 py-3 text-left transition-colors ${
                isSelected
                  ? 'bg-immo-accent-green/10'
                  : 'hover:bg-immo-bg-card-hover'
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-immo-accent-green/15 text-xs font-semibold text-immo-accent-green">
                {getInitials(label)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-immo-text-primary">
                    {label}
                  </span>
                  <span className="shrink-0 text-[11px] text-immo-text-muted">{time}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-xs ${
                    conv.unreadCount > 0
                      ? 'font-semibold text-immo-text-primary'
                      : 'text-immo-text-muted'
                  }`}>
                    {subtitle || t('inbox.no_preview')}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-immo-accent-green px-1.5 text-[10px] font-bold text-white">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                {agentName && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-immo-text-muted">
                    <User className="h-2.5 w-2.5" />
                    <span className="truncate">{agentName}</span>
                  </div>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
