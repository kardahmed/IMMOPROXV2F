import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface InboxMessage {
  id: string
  tenant_id: string
  client_id: string | null
  agent_id: string | null
  direction: 'inbound' | 'outbound'
  from_phone: string | null
  to_phone: string | null
  body_text: string | null
  message_type: string | null
  template_name: string | null
  status: string
  read_at: string | null
  created_at: string
  clients?: { id: string; full_name: string; phone: string; agent_id: string | null } | null
}

export interface Conversation {
  key: string
  client: InboxMessage['clients']
  phone: string
  agentId: string | null
  lastMessage: InboxMessage
  messages: InboxMessage[]
  unreadCount: number
  lastMessageAt: string
}

const INBOX_FETCH_LIMIT = 500
const POLL_INTERVAL_MS = 30_000

// Fetch the latest 500 messages for the current tenant (RLS already filters
// agent → own clients, admin → all). Then group client-side by client_id
// or by phone for unknown senders.
export function useInboxConversations() {
  return useQuery({
    queryKey: ['inbox', 'conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select(
          'id, tenant_id, client_id, agent_id, direction, from_phone, to_phone, body_text, message_type, template_name, status, read_at, created_at, clients(id, full_name, phone, agent_id)',
        )
        .order('created_at', { ascending: false })
        .limit(INBOX_FETCH_LIMIT)
      if (error) throw error
      return (data ?? []) as unknown as InboxMessage[]
    },
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 10_000,
  })
}

// Group flat message list into per-client conversations, sorted by most
// recent activity. Threads inside each conversation are oldest-first so
// the UI can render top-to-bottom like a chat.
export function useGroupedConversations(messages: InboxMessage[] | undefined): Conversation[] {
  return useMemo(() => {
    if (!messages?.length) return []
    const map = new Map<string, Conversation>()

    for (const m of messages) {
      const phoneKey = m.direction === 'inbound' ? m.from_phone : m.to_phone
      const key = m.client_id ?? `phone:${phoneKey ?? 'unknown'}`

      if (!map.has(key)) {
        map.set(key, {
          key,
          client: m.clients ?? null,
          phone: phoneKey ?? '',
          agentId: m.agent_id ?? m.clients?.agent_id ?? null,
          lastMessage: m,
          messages: [],
          unreadCount: 0,
          lastMessageAt: m.created_at,
        })
      }

      const conv = map.get(key)!
      conv.messages.push(m)
      if (m.direction === 'inbound' && !m.read_at) conv.unreadCount++
      if (new Date(m.created_at) > new Date(conv.lastMessageAt)) {
        conv.lastMessageAt = m.created_at
        conv.lastMessage = m
      }
    }

    for (const conv of map.values()) {
      conv.messages.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    )
  }, [messages])
}

// Total unread count across all visible conversations — drives the sidebar
// badge.
export function useInboxUnreadCount(): number {
  const { data } = useInboxConversations()
  return useMemo(
    () => (data ?? []).filter((m) => m.direction === 'inbound' && !m.read_at).length,
    [data],
  )
}

// Mark a list of message IDs as read via the RPC (migration 031). The RPC
// re-applies the agent-vs-admin filter server-side so we don't trust the
// client to send only legitimate IDs.
export function useMarkMessagesRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (messageIds.length === 0) return 0
      const { data, error } = await supabase.rpc('mark_messages_read' as never, {
        message_ids: messageIds,
      } as never)
      if (error) throw error
      return (data as number) ?? 0
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] })
    },
  })
}
