import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Phone, MessageCircle, CheckCheck, Check, AlertCircle, Send, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
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
  const time = format(new Date(message.created_at ?? 0), 'HH:mm', { locale: fr })
  const date = format(new Date(message.created_at ?? 0), 'd MMM yyyy', { locale: fr })

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
  const qc = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')

  // Reset the draft when switching conversations.
  useEffect(() => setDraft(''), [conversation?.key])

  // Scroll to bottom when conversation changes or new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [conversation?.key, conversation?.messages.length])

  const sendMessage = useMutation({
    mutationFn: async (params: { to: string; clientId: string | null; bodyText: string }) => {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          to: params.to,
          body_text: params.bodyText,
          client_id: params.clientId ?? undefined,
        },
      })
      if (error) throw error
      return data as { success: boolean; error?: string; remaining?: number }
    },
    onSuccess: (data) => {
      if (!data?.success) throw new Error(data?.error ?? 'Echec envoi')
      setDraft('')
      qc.invalidateQueries({ queryKey: ['inbox'] })
      toast.success(t('inbox.send_success'))
    },
    onError: (err: Error) => {
      toast.error(err.message ?? t('inbox.send_error'))
    },
  })

  const handleSend = () => {
    if (!conversation || !draft.trim() || sendMessage.isPending) return
    sendMessage.mutate({
      to: conversation.phone,
      clientId: conversation.client?.id ?? null,
      bodyText: draft.trim(),
    })
  }

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

      {/* Quick send composer */}
      <div className="border-t border-immo-border-default bg-immo-bg-card px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={t('inbox.send_placeholder')}
            rows={1}
            disabled={sendMessage.isPending}
            className="flex-1 resize-none rounded-lg border border-immo-border-default bg-immo-bg-app px-3 py-2 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:outline-none focus:ring-1 focus:ring-immo-accent-green disabled:opacity-50"
            style={{ maxHeight: '120px', minHeight: '40px' }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sendMessage.isPending}
            aria-label={t('inbox.send_action')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-immo-accent-green text-white transition-colors hover:bg-immo-accent-green/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-immo-text-muted">
          {t('inbox.send_hint')}
        </p>
      </div>
    </div>
  )
}
