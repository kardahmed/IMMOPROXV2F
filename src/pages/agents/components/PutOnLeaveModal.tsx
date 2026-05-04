// PutOnLeaveModal — flips an agent to status='on_leave' for a known
// window with an optional substitute. Intended for vacation, médical,
// or any planned absence that has a return date.
//
// Behaviour:
//   - Login stays open so the agent can catch up when they return.
//   - capture-lead and round-robin already filter on status='active',
//     so an on_leave agent won't get NEW assignments automatically.
//   - The optional backup_agent_id is informational today (used by
//     the inbox / tasks views to surface "you're covering for X").
//   - At leave_ends_at, the auto-reactivate-agents cron flips them
//     back to active.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { algerianDateTimeToISO } from '@/lib/algerianDate'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format, addDays } from 'date-fns'
import toast from 'react-hot-toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  agent: { id: string; first_name: string; last_name: string; tenant_id: string } | null
}

export function PutOnLeaveModal({ isOpen, onClose, agent }: Props) {
  const qc = useQueryClient()
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 14), 'yyyy-MM-dd'))
  const [backupId, setBackupId] = useState('')
  const [reason, setReason] = useState('')

  // Other active agents in the tenant — they are the only valid
  // candidates as a backup. Self-coverage is excluded.
  const { data: peers = [] } = useQuery({
    queryKey: ['agent-peers', agent?.tenant_id, agent?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('tenant_id', agent!.tenant_id)
        .in('role', ['agent', 'admin'])
        .eq('status', 'active')
        .neq('id', agent!.id)
        .order('first_name')
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>
    },
    enabled: isOpen && !!agent,
  })

  const submit = useMutation({
    mutationFn: async () => {
      if (!agent) return
      if (!startDate || !endDate) throw new Error('Dates requises')
      if (endDate < startDate) throw new Error('La date de retour doit être après la date de départ')

      // Audit (MED): refuse a leave_ends_at already in the past —
      // the auto-reactivate cron would flip the agent back to active
      // on its very next tick, which is surprising for the admin.
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (new Date(endDate) < today) {
        throw new Error('La date de retour doit être aujourd\'hui ou ultérieure')
      }

      const { error } = await supabase.from('users').update({
        status: 'on_leave',
        // Anchor leave boundaries in Algiers so the cron checks at
        // local midnight don't misfire by a day. See
        // src/lib/algerianDate.ts.
        leave_starts_at: algerianDateTimeToISO(startDate, '00:00'),
        leave_ends_at:   algerianDateTimeToISO(endDate,   '23:59'),
        backup_agent_id: backupId || null,
        leave_reason: reason.trim() || null,
      } as never).eq('id', agent.id)

      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents-list'] })
      toast.success(`${agent!.first_name} mis en congé jusqu'au ${format(new Date(endDate), 'dd/MM/yyyy')}`)
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!agent) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Mettre ${agent.first_name} en congé`} size="sm">
      <div className="space-y-4">
        <div className="rounded-lg border border-immo-accent-blue/20 bg-immo-accent-blue/5 px-3 py-2 text-[11px] text-immo-text-secondary">
          Pendant son congé, l'agent ne reçoit plus de nouveaux leads ni
          de touchpoints automatiques. Il pourra toujours se connecter
          pour rattraper son retard à son retour.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block text-xs text-immo-text-muted">Date de départ</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm" />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-immo-text-muted">Date de retour</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm" />
          </div>
        </div>

        <div>
          <Label className="mb-1 block text-xs text-immo-text-muted">Remplaçant pendant l'absence</Label>
          <select
            value={backupId}
            onChange={e => setBackupId(e.target.value)}
            className="h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary"
          >
            <option value="">— Aucun (l'admin gère) —</option>
            {peers.map(p => (
              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
            ))}
          </select>
        </div>

        <div>
          <Label className="mb-1 block text-xs text-immo-text-muted">Motif (optionnel)</Label>
          <Input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Congé annuel, arrêt maladie…"
            className="text-sm"
          />
        </div>

        <Button
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
          className="w-full bg-immo-status-orange font-semibold text-white hover:bg-immo-status-orange/90"
        >
          {submit.isPending
            ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Enregistrement…</>
            : <><CalendarDays className="mr-1.5 h-4 w-4" /> Mettre en congé</>}
        </Button>
      </div>
    </Modal>
  )
}
