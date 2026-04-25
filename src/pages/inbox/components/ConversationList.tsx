import { useTranslation } from 'react-i18next'
import { Inbox } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Conversation } from '@/hooks/useInbox'

interface Props {
  conversations: Conversation[]
  selectedKey: string | null
  onSelect: (conv: Conversation) => void
}

function formatPhone(phone: string): string {
  if (!phone) return ''
  return phone.startsWith('+') ? phone : `+${phone}`
}

function initials(label: string): string {
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function ConversationList({ conversations, selectedKey, onSelect }: Props) {
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
                {initials(label)}
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
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
