import { useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

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

// Fetch the latest 500 messages for the current tenant (RLS already filters
// agent → own clients, admin → all). Then group client-side by client_id
// or by phone for unknown senders.
//
// Pre-fix this hook polled every 30s (refetchInterval), pulling 500 rows
// + nested client embeds even when the inbox was idle — constant
// bandwidth burn per open tab and a >30s lag before a new WhatsApp
// reply showed up. Now the initial fetch happens once and a Supabase
// realtime channel pushes inserts/updates as they land in the DB,
// triggering a react-query invalidation. Bandwidth ~10x lower; new
// messages appear within ~1s of arriving on the Meta webhook.
export function useInboxConversations() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()

  const query = useQuery({
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
    // No refetchInterval — realtime channel below is the source of
    // truth for freshness. staleTime 5min means tab-switching back
    // doesn't trigger a redundant refetch when the channel is open.
    staleTime: 5 * 60 * 1000,
  })

  // Subscribe to whatsapp_messages changes for the current tenant.
  // The filter on tenant_id keeps this scoped — we don't get
  // notifications for other tenants' messages even though all rows
  // exist in the same table.
  //
  // Channel name uses a random suffix so React 19 strict-mode's
  // double-mount-in-dev doesn't try to reuse an already-subscribed
  // channel and crash with "cannot add postgres_changes callbacks
  // ... after subscribe()". Each useEffect cycle gets a fresh
  // channel; cleanup removes it before the next one is created.
  // Steps are also broken out into separate statements (.on() then
  // .subscribe()) instead of chained, so any future refactor can't
  // accidentally swap the order.
  useEffect(() => {
    if (!tenantId) return
    const suffix = Math.random().toString(36).slice(2, 10)
    const channel = supabase.channel(`inbox-${tenantId}-${suffix}`)

    channel.on(
      // Cast via unknown — typed Postgres realtime channel
      // signatures are huge and don't add safety here.
      'postgres_changes' as never,
      {
        event: '*',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `tenant_id=eq.${tenantId}`,
      } as never,
      () => {
        // Invalidate the conversations query so react-query refetches
        // the latest 500 rows. Cheap because there's no polling
        // overhead — refetch fires only when something actually
        // changes.
        qc.invalidateQueries({ queryKey: ['inbox', 'conversations'] })
        qc.invalidateQueries({ queryKey: ['inbox', 'unread-count'] })
      },
    )

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, qc])

  return query
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

export interface TenantAgent {
  id: string
  first_name: string | null
  last_name: string | null
}

// Fetch the active agents + admins of the current tenant — used by the
// inbox agent filter so an admin can isolate one agent's conversations.
// Disabled until a tenantId is provided so it doesn't fire on the login
// page or for super_admin viewing nothing.
export function useTenantAgents(tenantId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['tenant-agents', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('tenant_id', tenantId!)
        .in('role', ['agent', 'admin'])
        .eq('status', 'active')
        .order('first_name', { ascending: true })
      if (error) throw error
      return (data ?? []) as TenantAgent[]
    },
    enabled: enabled && !!tenantId,
    staleTime: 5 * 60_000,
  })
}
