import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader, PageSkeleton } from '@/components/common'
import {
  useInboxConversations,
  useGroupedConversations,
  useMarkMessagesRead,
  type Conversation,
} from '@/hooks/useInbox'
import { ConversationList } from './components/ConversationList'
import { ConversationThread } from './components/ConversationThread'

export function InboxPage() {
  const { t } = useTranslation()
  const { data: messages, isLoading } = useInboxConversations()
  const conversations = useGroupedConversations(messages)
  const markRead = useMarkMessagesRead()

  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Auto-select the first conversation on mount (desktop UX). Mobile users
  // see the list first and tap to open — handled by selectedKey being null.
  useEffect(() => {
    if (selectedKey === null && conversations.length > 0 && window.innerWidth >= 768) {
      setSelectedKey(conversations[0].key)
    }
  }, [conversations, selectedKey])

  const selectedConversation = useMemo<Conversation | null>(
    () => conversations.find((c) => c.key === selectedKey) ?? null,
    [conversations, selectedKey],
  )

  // When a conversation is opened, mark all its inbound unread messages as read.
  useEffect(() => {
    if (!selectedConversation) return
    const unreadIds = selectedConversation.messages
      .filter((m) => m.direction === 'inbound' && !m.read_at)
      .map((m) => m.id)
    if (unreadIds.length > 0) {
      markRead.mutate(unreadIds)
    }
    // markRead is stable across renders via useMutation, exclude from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.key, selectedConversation?.messages.length])

  if (isLoading) return <PageSkeleton hasTable />

  const totalConversations = conversations.length
  const subtitle =
    totalConversations === 0
      ? t('inbox.empty_subtitle')
      : t('inbox.subtitle', { count: totalConversations })

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6">
        <PageHeader title={t('inbox.title')} subtitle={subtitle} />
      </div>

      <div className="mt-4 flex flex-1 overflow-hidden border-t border-immo-border-default">
        {/* Conversations list — left pane */}
        <div className={`w-full border-r border-immo-border-default bg-immo-bg-card md:w-[340px] md:shrink-0 ${
          selectedConversation && 'hidden md:block'
        }`}>
          <div className="h-full overflow-y-auto">
            <ConversationList
              conversations={conversations}
              selectedKey={selectedKey}
              onSelect={(c) => setSelectedKey(c.key)}
            />
          </div>
        </div>

        {/* Thread — right pane (full width on mobile when selected) */}
        <div className={`flex-1 ${
          !selectedConversation && 'hidden md:flex'
        }`}>
          {/* Mobile back button */}
          {selectedConversation && (
            <div className="flex md:hidden">
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="border-b border-immo-border-default bg-immo-bg-card px-4 py-2 text-xs text-immo-text-secondary"
              >
                ← {t('action.back')}
              </button>
            </div>
          )}
          <ConversationThread conversation={selectedConversation} />
        </div>
      </div>
    </div>
  )
}
