import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send, Inbox } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card, PageHeader, PageSkeleton, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed'

export function SupportPage() {
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['super-admin-tickets'],
    queryFn: async () => {
      const { data } = await supabase.from('support_tickets').select('*, tenants(name), users(first_name, last_name)').order('updated_at', { ascending: false })
      return (data ?? []) as Array<Record<string, unknown>>
    },
  })

  const { data: messages = [] } = useQuery({
    queryKey: ['ticket-messages', selectedTicket],
    queryFn: async () => {
      if (!selectedTicket) return []
      const { data } = await supabase.from('ticket_messages').select('*, users(first_name, last_name)').eq('ticket_id', selectedTicket).order('created_at')
      return (data ?? []) as Array<Record<string, unknown>>
    },
    enabled: !!selectedTicket,
  })

  const sendReply = useMutation({
    mutationFn: async () => {
      await supabase.from('ticket_messages').insert({ ticket_id: selectedTicket, sender_id: userId, body: reply } as never)
      await supabase.from('support_tickets').update({ updated_at: new Date().toISOString() } as never).eq('id', selectedTicket!)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket-messages'] }); setReply(''); toast.success('Réponse envoyée') },
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from('support_tickets').update({ status, updated_at: new Date().toISOString() } as never).eq('id', id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['super-admin-tickets'] }); toast.success('Statut mis à jour') },
  })

  const STATUS_MAP: Record<string, { label: string; type: 'green' | 'orange' | 'blue' | 'muted' }> = {
    open: { label: 'Ouvert', type: 'orange' },
    in_progress: { label: 'En cours', type: 'blue' },
    resolved: { label: 'Resolu', type: 'green' },
    closed: { label: 'Ferme', type: 'muted' },
  }

  if (isLoading) return <PageSkeleton kpiCount={0} />

  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length
  const filteredTickets = statusFilter === 'all' ? tickets : tickets.filter(t => t.status === statusFilter)

  const FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: `Tous (${tickets.length})` },
    { value: 'open', label: `Ouverts (${tickets.filter(t => t.status === 'open').length})` },
    { value: 'in_progress', label: `En cours (${tickets.filter(t => t.status === 'in_progress').length})` },
    { value: 'resolved', label: `Resolus (${tickets.filter(t => t.status === 'resolved').length})` },
    { value: 'closed', label: `Fermes (${tickets.filter(t => t.status === 'closed').length})` },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle={`${openCount} ticket(s) a traiter`}
      />

      {/* Status filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-[#7C3AED]/15 text-[#7C3AED]'
                : 'text-immo-text-secondary hover:bg-immo-bg-card-hover'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Tickets list */}
        <div className="space-y-2 lg:col-span-5 xl:col-span-4">
          {filteredTickets.map(t => {
            const st = STATUS_MAP[t.status as string] ?? STATUS_MAP.open
            const user = t.users as { first_name: string; last_name: string } | null
            const tenant = t.tenants as { name: string } | null
            return (
              <button key={t.id as string} onClick={() => setSelectedTicket(t.id as string)}
                className={`w-full rounded-lg border p-3 text-left transition-all ${selectedTicket === t.id ? 'border-[#7C3AED] bg-[#7C3AED]/5' : 'border-immo-border-default bg-immo-bg-card hover:bg-immo-bg-card-hover'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-immo-text-primary">{t.subject as string}</p>
                  <StatusBadge label={st.label} type={st.type} />
                </div>
                <p className="mt-1 truncate text-[11px] text-immo-text-muted">{user?.first_name} {user?.last_name} · {tenant?.name} · {format(new Date(t.created_at as string), 'dd/MM HH:mm')}</p>
              </button>
            )
          })}
          {filteredTickets.length === 0 && (
            <div className="rounded-xl border border-dashed border-immo-border-default bg-immo-bg-card p-8 text-center">
              <Inbox className="mx-auto mb-2 h-8 w-8 text-immo-text-muted" />
              <p className="text-sm text-immo-text-secondary">Aucun ticket dans cette categorie</p>
            </div>
          )}
        </div>

        {/* Ticket detail */}
        <div className="lg:col-span-7 xl:col-span-8">
          {selectedTicket ? (
            <Card noPadding>
              <div className="border-b border-immo-border-default px-5 py-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#7C3AED]" />
                  <span className="text-sm font-semibold text-immo-text-primary">{(tickets.find(t => t.id === selectedTicket) as Record<string, unknown>)?.subject as string}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {['open', 'in_progress', 'resolved', 'closed'].map(s => {
                    const isActive = (tickets.find(t => t.id === selectedTicket) as Record<string, unknown>)?.status === s
                    const colorMap: Record<string, string> = {
                      green: 'bg-immo-accent-green/10 text-immo-accent-green',
                      blue: 'bg-immo-accent-blue/10 text-immo-accent-blue',
                      orange: 'bg-immo-status-orange/10 text-immo-status-orange',
                      muted: 'bg-immo-bg-primary text-immo-text-secondary',
                    }
                    return (
                      <button key={s} onClick={() => updateStatus.mutate({ id: selectedTicket, status: s })}
                        disabled={updateStatus.isPending}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium disabled:opacity-50 ${isActive ? colorMap[STATUS_MAP[s].type] : 'text-immo-text-muted hover:bg-immo-bg-card-hover'}`}>
                        {STATUS_MAP[s].label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="max-h-[500px] min-h-[300px] space-y-3 overflow-y-auto p-5">
                {messages.map(m => {
                  const sender = m.users as { first_name: string; last_name: string } | null
                  return (
                    <div key={m.id as string} className="rounded-lg bg-immo-bg-primary p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-immo-text-primary">{sender?.first_name} {sender?.last_name}</span>
                        <span className="text-[10px] text-immo-text-muted">{format(new Date(m.created_at as string), 'dd/MM HH:mm')}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-immo-text-secondary">{m.body as string}</p>
                    </div>
                  )
                })}
                {messages.length === 0 && (
                  <p className="py-8 text-center text-xs text-immo-text-muted">Aucun message dans ce ticket</p>
                )}
              </div>

              <div className="flex gap-2 border-t border-immo-border-default p-4">
                <Input value={reply} onChange={e => setReply(e.target.value)} placeholder="Votre reponse..." variant="immo" />
                <Button onClick={() => sendReply.mutate()} disabled={!reply || sendReply.isPending} variant="purple">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-immo-border-default bg-immo-bg-card p-8">
              <MessageSquare className="mb-3 h-10 w-10 text-immo-text-muted" />
              <p className="text-sm font-medium text-immo-text-secondary">Selectionnez un ticket</p>
              <p className="mt-1 text-xs text-immo-text-muted">Choisissez un ticket dans la liste pour voir la conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
