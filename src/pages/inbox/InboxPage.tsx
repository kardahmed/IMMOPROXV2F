import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { PageHeader, PageSkeleton, FilterDropdown } from '@/components/common'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
  useInboxConversations,
  useGroupedConversations,
  useMarkMessagesRead,
  useTenantAgents,
  type Conversation,
} from '@/hooks/useInbox'
import { ConversationList } from './components/ConversationList'
import { ConversationThread } from './components/ConversationThread'

type ReadFilter = 'all' | 'unread'

export function InboxPage() {
  const { t } = useTranslation()
  const { tenantId } = useAuthStore()
  const { isAdmin } = usePermissions()

  const { data: messages, isLoading } = useInboxConversations()
  const conversations = useGroupedConversations(messages)
  const markRead = useMarkMessagesRead()

  // Admin-only filter dataset — the query stays disabled for plain agents.
  const { data: agents = [] } = useTenantAgents(tenantId, isAdmin)

  // Filter state — every change just narrows the in-memory list, no
  // re-fetch is needed since useInboxConversations already pulls 500
  // most recent messages and groups them client-side.
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')
  const [search, setSearch] = useState('')

  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // id → "Prénom Nom" so the conversation row can label an admin's
  // 50-deep list with who's actually handling each thread.
  const agentMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of agents) {
      m.set(a.id, `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || 'Agent')
    }
    return m
  }, [agents])

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    return conversations.filter((c) => {
      if (agentFilter !== 'all' && c.agentId !== agentFilter) return false
      if (readFilter === 'unread' && c.unreadCount === 0) return false
      if (q) {
        const name = (c.client?.full_name ?? '').toLowerCase()
        const phone = (c.phone ?? '').toLowerCase()
        if (!name.includes(q) && !phone.includes(q)) return false
      }
      return true
    })
  }, [conversations, agentFilter, readFilter, search])

  // Auto-select the first conversation on first mount only (desktop UX).
  // Audit (HIGH): the previous version had `filteredConversations` in
  // the dep array and re-ran on every keystroke in the search bar,
  // which is wasteful and caused unnecessary re-renders. The ref
  // ensures we only auto-select once per page mount.
  const didAutoSelectRef = useRef(false)
  useEffect(() => {
    if (didAutoSelectRef.current) return
    if (selectedKey === null && filteredConversations.length > 0 && window.innerWidth >= 768) {
      setSelectedKey(filteredConversations[0].key)
      didAutoSelectRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredConversations.length])

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

  const totalUnread = conversations.reduce((acc, c) => acc + c.unreadCount, 0)
  const totalConversations = filteredConversations.length
  const subtitle =
    conversations.length === 0
      ? t('inbox.empty_subtitle')
      : t('inbox.subtitle', { count: conversations.length })

  const agentOptions = [
    { value: 'all', label: 'Tous les agents' },
    ...agents.map((a) => ({
      value: a.id,
      label: `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || 'Agent',
    })),
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6">
        <PageHeader title={t('inbox.title')} subtitle={subtitle} />
      </div>

      <div className="mt-4 flex flex-1 overflow-hidden border-t border-immo-border-default">
        {/* Conversations list — left pane */}
        <div className={`w-full border-r border-immo-border-default bg-immo-bg-card md:w-[360px] md:shrink-0 ${
          selectedConversation && 'hidden md:block'
        }`}>
          <div className="flex h-full flex-col">
            {/* Toolbar — search + chips + agent dropdown (admin only) */}
            <div className="space-y-2 border-b border-immo-border-default px-3 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-immo-text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher nom ou téléphone…"
                  className="h-8 w-full rounded-md border border-immo-border-default bg-immo-bg-primary pl-7 pr-7 text-xs text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Effacer"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-immo-text-muted hover:text-immo-text-primary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReadFilter('all')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    readFilter === 'all'
                      ? 'bg-immo-accent-green/10 text-immo-accent-green'
                      : 'border border-immo-border-default text-immo-text-muted hover:text-immo-text-primary'
                  }`}
                >
                  Tout
                </button>
                <button
                  type="button"
                  onClick={() => setReadFilter('unread')}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    readFilter === 'unread'
                      ? 'bg-immo-accent-green/10 text-immo-accent-green'
                      : 'border border-immo-border-default text-immo-text-muted hover:text-immo-text-primary'
                  }`}
                >
                  Non lu
                  {totalUnread > 0 && (
                    <span className="rounded-full bg-immo-accent-green px-1.5 text-[10px] font-bold text-white">
                      {totalUnread}
                    </span>
                  )}
                </button>

                {isAdmin && agents.length > 0 && (
                  <div className="ml-auto">
                    <FilterDropdown
                      label="Agent"
                      options={agentOptions}
                      value={agentFilter}
                      onChange={setAgentFilter}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <ConversationList
                conversations={filteredConversations}
                selectedKey={selectedKey}
                onSelect={(c) => setSelectedKey(c.key)}
                agentMap={isAdmin ? agentMap : undefined}
              />
            </div>

            {/* Footer count — useful when filters narrow the list */}
            {(search || agentFilter !== 'all' || readFilter !== 'all') && (
              <div className="border-t border-immo-border-default px-3 py-2 text-[11px] text-immo-text-muted">
                {totalConversations} sur {conversations.length} conversation{conversations.length > 1 ? 's' : ''}
              </div>
            )}
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
