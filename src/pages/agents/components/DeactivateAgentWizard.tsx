// DeactivateAgentWizard — handles the agent-leaves-for-good case.
//
// Before this wizard, the "Désactiver" button on AgentsPage flipped
// users.status='inactive' and stopped there. The agent's 47 clients,
// 12 open tasks, 3 planned visits and 2 active reservations stayed
// silently attached to a logged-out account, so they fell off the
// radar of every other agent. This was the #1 cause of orphaned
// pipelines after a resignation.
//
// The wizard now runs a 4-step transaction:
//
//   Step 1 — Inventory.    Show counters of what's attached to the
//                          agent so the admin understands the
//                          blast radius before clicking through.
//   Step 2 — Clients.      Pick a target agent (or split between
//                          several — v1 takes one).
//   Step 3 — Tasks +       Per category: transfer to the same target
//            visits +      / split / cancel / leave alone (admin
//            reservations  handles).
//   Step 4 — Confirm.      Apply all UPDATE queries, then flip
//                          users.status='inactive', drop one history
//                          row per client documenting the handover.

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Users, ClipboardList, CalendarDays, Bookmark, Loader2, ArrowRight, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  agent: { id: string; first_name: string; last_name: string; tenant_id: string } | null
}

type TaskAction = 'transfer' | 'cancel'
type VisitAction = 'transfer' | 'cancel'
type ReservationAction = 'transfer' | 'keep'

export function DeactivateAgentWizard({ isOpen, onClose, agent }: Props) {
  const qc = useQueryClient()
  const actorId = useAuthStore(s => s.session?.user?.id)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [targetAgentId, setTargetAgentId] = useState('')
  const [taskAction, setTaskAction] = useState<TaskAction>('transfer')
  const [visitAction, setVisitAction] = useState<VisitAction>('transfer')
  const [reservationAction, setReservationAction] = useState<ReservationAction>('transfer')
  const [submitting, setSubmitting] = useState(false)

  // Counters of what's attached to this agent today.
  const { data: inventory, isLoading: loadingInv } = useQuery({
    queryKey: ['agent-inventory', agent?.id],
    queryFn: async () => {
      const [clients, tasks, visits, reservations] = await Promise.all([
        supabase.from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', agent!.id)
          .is('deleted_at', null),
        supabase.from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', agent!.id)
          .eq('status', 'pending')
          .is('deleted_at', null),
        supabase.from('visits')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', agent!.id)
          .in('status', ['planned', 'confirmed'])
          .is('deleted_at', null),
        supabase.from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', agent!.id)
          .eq('status', 'active'),
      ])
      return {
        clients: clients.count ?? 0,
        tasks: tasks.count ?? 0,
        visits: visits.count ?? 0,
        reservations: reservations.count ?? 0,
      }
    },
    enabled: isOpen && !!agent,
  })

  // Other active agents — receivers for the handover.
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

  const target = peers.find(p => p.id === targetAgentId) ?? null

  async function applyDeactivation() {
    if (!agent) return
    if (!targetAgentId && (inventory?.clients ?? 0) > 0) {
      toast.error('Sélectionnez un agent cible')
      return
    }

    setSubmitting(true)
    try {
      // 1. Reassign clients
      if ((inventory?.clients ?? 0) > 0) {
        const { error: clientsErr } = await supabase
          .from('clients')
          .update({ agent_id: targetAgentId } as never)
          .eq('agent_id', agent.id)
          .is('deleted_at', null)
        if (clientsErr) throw new Error(`Réassignation clients : ${clientsErr.message}`)

        // History row per affected client.
        const { data: movedClients } = await supabase
          .from('clients')
          .select('id')
          .eq('agent_id', targetAgentId)
          .is('deleted_at', null)
        if (movedClients && movedClients.length > 0 && target) {
          const targetName = `${target.first_name} ${target.last_name}`.trim()
          const histRows = movedClients.map(c => ({
            tenant_id: agent.tenant_id,
            client_id: c.id,
            agent_id: actorId ?? null,
            type: 'note',
            title: `Réassigné de ${agent.first_name} ${agent.last_name} → ${targetName} suite au départ de l'agent`,
          }))
          await supabase.from('history').insert(histRows as never)
        }
      }

      // 2. Tasks — transfer or cancel.
      if ((inventory?.tasks ?? 0) > 0) {
        if (taskAction === 'transfer') {
          const { error } = await supabase
            .from('tasks')
            .update({ agent_id: targetAgentId } as never)
            .eq('agent_id', agent.id)
            .eq('status', 'pending')
            .is('deleted_at', null)
          if (error) throw new Error(`Transfert tâches : ${error.message}`)
        } else {
          // cancel — set status='ignored' so check-tasks-no-reply skips them.
          const { error } = await supabase
            .from('tasks')
            .update({ status: 'ignored' } as never)
            .eq('agent_id', agent.id)
            .eq('status', 'pending')
            .is('deleted_at', null)
          if (error) throw new Error(`Annulation tâches : ${error.message}`)
        }
      }

      // 3. Visits — transfer or cancel.
      if ((inventory?.visits ?? 0) > 0) {
        if (visitAction === 'transfer') {
          const { error } = await supabase
            .from('visits')
            .update({ agent_id: targetAgentId } as never)
            .eq('agent_id', agent.id)
            .in('status', ['planned', 'confirmed'])
            .is('deleted_at', null)
          if (error) throw new Error(`Transfert visites : ${error.message}`)
        } else {
          const { error } = await supabase
            .from('visits')
            .update({ status: 'cancelled' } as never)
            .eq('agent_id', agent.id)
            .in('status', ['planned', 'confirmed'])
            .is('deleted_at', null)
          if (error) throw new Error(`Annulation visites : ${error.message}`)
        }
      }

      // 4. Reservations — transfer or keep (admin manages).
      if ((inventory?.reservations ?? 0) > 0 && reservationAction === 'transfer') {
        const { error } = await supabase
          .from('reservations')
          .update({ agent_id: targetAgentId } as never)
          .eq('agent_id', agent.id)
          .eq('status', 'active')
        if (error) throw new Error(`Transfert réservations : ${error.message}`)
      }

      // 5. Final flip — agent is now inactive.
      const { error: deactErr } = await supabase
        .from('users')
        .update({
          status: 'inactive',
          leave_starts_at: null,
          leave_ends_at: null,
          backup_agent_id: null,
          leave_reason: null,
        } as never)
        .eq('id', agent.id)
      if (deactErr) throw new Error(`Désactivation : ${deactErr.message}`)

      toast.success(`${agent.first_name} ${agent.last_name} désactivé. Tout son portefeuille a été réparti.`)
      qc.invalidateQueries({ queryKey: ['agents-list'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['agent-inventory'] })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (!agent) return null
  const inv = inventory ?? { clients: 0, tasks: 0, visits: 0, reservations: 0 }
  const hasAnything = inv.clients + inv.tasks + inv.visits + inv.reservations > 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Désactiver ${agent.first_name} ${agent.last_name}`}
      subtitle={`Étape ${step} / ${hasAnything ? 4 : 2}`}
      size="md"
    >
      {loadingInv ? (
        <div className="flex items-center gap-2 py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-immo-text-muted">Inventaire en cours…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* STEP 1 — Inventory */}
          {step === 1 && (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-immo-status-orange/30 bg-immo-status-orange/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-immo-status-orange" />
                <div className="text-xs text-immo-text-secondary">
                  Cette action est irréversible. Le compte de l'agent sera bloqué et
                  son portefeuille sera réparti selon les choix ci-dessous. Les
                  ventes et l'historique restent attachés pour l'audit.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Tile icon={<Users />} count={inv.clients} label="clients actifs" />
                <Tile icon={<ClipboardList />} count={inv.tasks} label="tâches en cours" />
                <Tile icon={<CalendarDays />} count={inv.visits} label="visites planifiées" />
                <Tile icon={<Bookmark />} count={inv.reservations} label="réservations actives" />
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={onClose} className="text-immo-text-muted">Annuler</Button>
                {hasAnything ? (
                  <Button onClick={() => setStep(2)} className="bg-immo-accent-green text-white">
                    Continuer <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={() => setStep(4)} className="bg-immo-status-red text-white">
                    Désactiver maintenant
                  </Button>
                )}
              </div>
            </>
          )}

          {/* STEP 2 — Pick target agent (clients) */}
          {step === 2 && hasAnything && (
            <>
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-immo-text-primary">
                  Réassigner les {inv.clients} client{inv.clients > 1 ? 's' : ''} et le portefeuille à :
                </Label>
                <select
                  value={targetAgentId}
                  onChange={e => setTargetAgentId(e.target.value)}
                  className="h-10 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary"
                >
                  <option value="">— Choisir un agent —</option>
                  {peers.map(p => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                  ))}
                </select>
                {peers.length === 0 && (
                  <p className="mt-2 text-[11px] text-immo-status-red">
                    Aucun autre agent actif disponible. Créez un agent avant de désactiver celui-ci.
                  </p>
                )}
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep(1)} className="text-immo-text-muted">Retour</Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!targetAgentId}
                  className="bg-immo-accent-green text-white"
                >
                  Suivant <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* STEP 3 — Per-category actions for tasks / visits / reservations */}
          {step === 3 && hasAnything && (
            <>
              {inv.tasks > 0 && (
                <ChoiceBlock
                  title={`${inv.tasks} tâche${inv.tasks > 1 ? 's' : ''} en cours`}
                  options={[
                    { value: 'transfer', label: `Transférer à ${target?.first_name ?? 'l\'agent cible'}` },
                    { value: 'cancel', label: 'Marquer comme ignorées' },
                  ]}
                  value={taskAction}
                  onChange={(v) => setTaskAction(v as TaskAction)}
                />
              )}

              {inv.visits > 0 && (
                <ChoiceBlock
                  title={`${inv.visits} visite${inv.visits > 1 ? 's' : ''} planifiée${inv.visits > 1 ? 's' : ''}`}
                  options={[
                    { value: 'transfer', label: `Transférer à ${target?.first_name ?? 'l\'agent cible'}` },
                    { value: 'cancel', label: 'Annuler — clients à recontacter' },
                  ]}
                  value={visitAction}
                  onChange={(v) => setVisitAction(v as VisitAction)}
                />
              )}

              {inv.reservations > 0 && (
                <ChoiceBlock
                  title={`${inv.reservations} réservation${inv.reservations > 1 ? 's' : ''} active${inv.reservations > 1 ? 's' : ''}`}
                  options={[
                    { value: 'transfer', label: `Transférer à ${target?.first_name ?? 'l\'agent cible'}` },
                    { value: 'keep', label: 'Détacher (gestion admin)' },
                  ]}
                  value={reservationAction}
                  onChange={(v) => setReservationAction(v as ReservationAction)}
                />
              )}

              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep(2)} className="text-immo-text-muted">Retour</Button>
                <Button onClick={() => setStep(4)} className="bg-immo-accent-green text-white">
                  Aperçu <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* STEP 4 — Confirm */}
          {step === 4 && (
            <>
              <div className="space-y-2 rounded-lg border border-immo-border-default bg-immo-bg-primary p-4">
                <p className="text-xs font-semibold text-immo-text-primary">Récapitulatif</p>
                <ul className="space-y-1.5 text-xs text-immo-text-secondary">
                  {inv.clients > 0 && target && (
                    <li className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-immo-accent-green" />
                      Les {inv.clients} clients passent chez {target.first_name} {target.last_name}
                    </li>
                  )}
                  {inv.tasks > 0 && (
                    <li className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-immo-accent-green" />
                      {inv.tasks} tâche{inv.tasks > 1 ? 's' : ''} :
                      {taskAction === 'transfer' ? ` transférée${inv.tasks > 1 ? 's' : ''} à ${target?.first_name}` : ` ignorée${inv.tasks > 1 ? 's' : ''}`}
                    </li>
                  )}
                  {inv.visits > 0 && (
                    <li className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-immo-accent-green" />
                      {inv.visits} visite{inv.visits > 1 ? 's' : ''} :
                      {visitAction === 'transfer' ? ` transférée${inv.visits > 1 ? 's' : ''} à ${target?.first_name}` : ` annulée${inv.visits > 1 ? 's' : ''}`}
                    </li>
                  )}
                  {inv.reservations > 0 && (
                    <li className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-immo-accent-green" />
                      {inv.reservations} réservation{inv.reservations > 1 ? 's' : ''} :
                      {reservationAction === 'transfer' ? ` transférée${inv.reservations > 1 ? 's' : ''} à ${target?.first_name}` : ` détachée${inv.reservations > 1 ? 's' : ''}`}
                    </li>
                  )}
                  <li className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-immo-accent-green" />
                    Compte {agent.first_name} bloqué (sales et historique conservés)
                  </li>
                </ul>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep(hasAnything ? 3 : 1)} className="text-immo-text-muted">Retour</Button>
                <Button
                  onClick={applyDeactivation}
                  disabled={submitting}
                  className="bg-immo-status-red font-semibold text-white"
                >
                  {submitting
                    ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Application…</>
                    : 'Confirmer la désactivation'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function Tile({ icon, count, label }: { icon: React.ReactNode; count: number; label: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${
      count > 0 ? 'border-immo-status-orange/30 bg-immo-status-orange/5' : 'border-immo-border-default bg-immo-bg-primary'
    }`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        count > 0 ? 'bg-immo-status-orange/15 text-immo-status-orange' : 'bg-immo-bg-card text-immo-text-muted'
      }`}>
        {icon}
      </span>
      <div>
        <p className="text-lg font-bold text-immo-text-primary">{count}</p>
        <p className="text-[10px] text-immo-text-muted">{label}</p>
      </div>
    </div>
  )
}

function ChoiceBlock({
  title, options, value, onChange,
}: {
  title: string
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="rounded-lg border border-immo-border-default p-3">
      <p className="mb-2 text-xs font-semibold text-immo-text-primary">{title}</p>
      <div className="space-y-1.5">
        {options.map(opt => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-immo-bg-card-hover">
            <input
              type="radio"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="accent-immo-accent-green"
            />
            <span className="text-xs text-immo-text-primary">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
