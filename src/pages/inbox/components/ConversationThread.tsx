import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Phone, MessageCircle, CheckCheck, Check, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Conversation, InboxMessage } from '@/hooks/useInbox'

interface Props {
  conversation: Conversation | null
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'read':
      return <CheckCheck className="h-3 w-3 text-immo-accent-green" />
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-immo-text-muted" />
    case 'sent':
      return <Check className="h-3 w-3 text-immo-text-muted" />
    case 'failed':
      return <AlertCircle className="h-3 w-3 text-immo-status-red" />
    default:
      return null
  }
}

function MessageBubble({ message }: { message: InboxMessage }) {
  const isOutbound = message.direction === 'outbound'
  const time = format(new Date(message.created_at), 'HH:mm', { locale: fr })
  const date = format(new Date(message.created_at), 'd MMM yyyy', { locale: fr })

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          isOutbound
            ? 'bg-immo-accent-green text-white rounded-br-md'
            : 'bg-immo-bg-card text-immo-text-primary border border-immo-border-default rounded-bl-md'
        }`}
        title={`${date} ${time}`}
      >
        <div className="whitespace-pre-wrap break-words">
          {message.body_text || (message.template_name ? `[${message.template_name}]` : '')}
        </div>
        <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
          isOutbound ? 'text-white/70' : 'text-immo-text-muted'
        }`}>
          <span>{time}</span>
          {isOutbound && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  )
}

export function ConversationThread({ conversation }: Props) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when conversation changes or new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [conversation?.key, conversation?.messages.length])

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-immo-text-muted">
        <MessageCircle className="mb-3 h-12 w-12 text-immo-text-muted/40" />
        <p className="font-medium text-immo-text-secondary">{t('inbox.select_conversation')}</p>
        <p className="mt-1 text-xs">{t('inbox.select_conversation_hint')}</p>
      </div>
    )
  }

  const label = conversation.client?.full_name ?? (conversation.phone ? `+${conversation.phone}` : t('inbox.unknown_sender'))
  const phone = conversation.phone ? (conversation.phone.startsWith('+') ? conversation.phone : `+${conversation.phone}`) : ''

  return (
    <div className="flex h-full flex-col bg-immo-bg-app">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-immo-border-default bg-immo-bg-card px-5 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-immo-accent-green/15 text-xs font-semibold text-immo-accent-green">
          {label
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? '')
            .join('')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-immo-text-primary">{label}</div>
          {phone && (
            <div className="flex items-center gap-1 text-xs text-immo-text-muted">
              <Phone className="h-3 w-3" />
              <span>{phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {conversation.messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {/* Quick send placeholder — wired in step C */}
      <div className="border-t border-immo-border-default bg-immo-bg-card px-5 py-3">
        <div className="rounded-lg border border-dashed border-immo-border-default bg-immo-bg-app px-3 py-2.5 text-center text-xs text-immo-text-muted">
          {t('inbox.send_disabled')}
        </div>
      </div>
    </div>
  )
}
