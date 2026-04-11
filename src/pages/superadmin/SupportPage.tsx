import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { LoadingSpinner, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export function SupportPage() {
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [reply, setReply] = useState('')

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket-messages'] }); setReply(''); toast.success('Reponse envoyee') },
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from('support_tickets').update({ status, updated_at: new Date().toISOString() } as never).eq('id', id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['super-admin-tickets'] }); toast.success('Statut mis a jour') },
  })

  const STATUS_MAP: Record<string, { label: string; type: 'green' | 'orange' | 'blue' | 'muted' }> = {
    open: { label: 'Ouvert', type: 'orange' },
    in_progress: { label: 'En cours', type: 'blue' },
    resolved: { label: 'Resolu', type: 'green' },
    closed: { label: 'Ferme', type: 'muted' },
  }

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-immo-text-primary">Support ({tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length} ouverts)</h1>

      <div className="flex gap-6">
        {/* Tickets list */}
        <div className="w-[400px] shrink-0 space-y-2">
          {tickets.map(t => {
            const st = STATUS_MAP[t.status as string] ?? STATUS_MAP.open
            const user = t.users as { first_name: string; last_name: string } | null
            const tenant = t.tenants as { name: string } | null
            return (
              <button key={t.id as string} onClick={() => setSelectedTicket(t.id as string)}
                className={`w-full rounded-lg border p-3 text-left transition-all ${selectedTicket === t.id ? 'border-[#7C3AED] bg-[#7C3AED]/5' : 'border-immo-border-default hover:bg-immo-bg-card-hover'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-immo-text-primary">{t.subject as string}</p>
                  <StatusBadge label={st.label} type={st.type} />
                </div>
                <p className="mt-1 text-[11px] text-immo-text-muted">{user?.first_name} {user?.last_name} · {tenant?.name} · {format(new Date(t.created_at as string), 'dd/MM HH:mm')}</p>
              </button>
            )
          })}
          {tickets.length === 0 && <p className="py-8 text-center text-sm text-immo-text-muted">Aucun ticket</p>}
        </div>

        {/* Ticket detail */}
        {selectedTicket ? (
          <div className="flex-1 rounded-xl border border-immo-border-default bg-immo-bg-card">
            <div className="border-b border-immo-border-default px-5 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#7C3AED]" />
                <span className="text-sm font-semibold text-immo-text-primary">{(tickets.find(t => t.id === selectedTicket) as Record<string, unknown>)?.subject as string}</span>
              </div>
              <div className="mt-1 flex gap-2">
                {['open', 'in_progress', 'resolved', 'closed'].map(s => (
                  <button key={s} onClick={() => updateStatus.mutate({ id: selectedTicket, status: s })}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${(tickets.find(t => t.id === selectedTicket) as Record<string, unknown>)?.status === s ? STATUS_MAP[s].type === 'green' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'bg-immo-accent-blue/10 text-immo-accent-blue' : 'text-immo-text-muted hover:bg-immo-bg-card-hover'}`}>
                    {STATUS_MAP[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[400px] space-y-3 overflow-y-auto p-5">
              {messages.map(m => {
                const sender = m.users as { first_name: string; last_name: string } | null
                return (
                  <div key={m.id as string} className="rounded-lg bg-immo-bg-primary p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-immo-text-primary">{sender?.first_name} {sender?.last_name}</span>
                      <span className="text-[10px] text-immo-text-muted">{format(new Date(m.created_at as string), 'dd/MM HH:mm')}</span>
                    </div>
                    <p className="mt-1 text-sm text-immo-text-secondary">{m.body as string}</p>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 border-t border-immo-border-default p-4">
              <Input value={reply} onChange={e => setReply(e.target.value)} placeholder="Votre reponse..." className="border-immo-border-default bg-immo-bg-primary text-immo-text-primary" />
              <Button onClick={() => sendReply.mutate()} disabled={!reply || sendReply.isPending} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-immo-text-muted">Selectionnez un ticket</div>
        )}
      </div>
    </div>
  )
}
