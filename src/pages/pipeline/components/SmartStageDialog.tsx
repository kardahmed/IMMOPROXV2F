import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Calendar, MapPin, Building2, Star, DollarSign, RotateCcw, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
// import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'
import { algerianDateTimeToISO } from '@/lib/algerianDate'
import toast from 'react-hot-toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  onConfirm: (note?: string) => void
  clientId: string
  clientName: string
  fromStage: PipelineStage
  toStage: PipelineStage
  loading?: boolean
}

const TIME_SLOTS = ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00']

export function SmartStageDialog({ isOpen, onClose, onConfirm, clientId, clientName, fromStage, toStage, loading }: Props) {
  const { t } = useTranslation()
  const userId = useAuthStore(s => s.session?.user?.id)
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()

  const from = PIPELINE_STAGES[fromStage]
  const to = PIPELINE_STAGES[toStage]

  // Form states for different dialogs
  const [note, setNote] = useState('')
  // Visit planning
  const [visitDate, setVisitDate] = useState('')
  const [visitTime, setVisitTime] = useState('')
  const [visitType, setVisitType] = useState('on_site')
  // Visit feedback
  const [visitNote, setVisitNote] = useState(0)
  const [visitPoints, setVisitPoints] = useState<string[]>([])
  const [visitReserves, setVisitReserves] = useState('')
  // Confirm/Report/Cancel
  const [confirmAction, setConfirmAction] = useState<'confirm' | 'report' | 'cancel'>('confirm')
  // Negociation
  const [budget, setBudget] = useState('')
  // Relancement/Perdue
  const [reason, setReason] = useState('')
  const [reminderDays, setReminderDays] = useState('')

  const createVisit = useMutation({
    mutationFn: async () => {
      if (!visitDate || !visitTime) return
      await supabase.from('visits').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: userId,
        // Anchor in Algiers (+01:00). Without the offset the
        // browser's local TZ leaks into Postgres, so 14:00 Algiers
        // got persisted as 14:00 UTC and rendered as 15:00 by
        // locale-aware formatters. See src/lib/algerianDate.ts.
        scheduled_at: algerianDateTimeToISO(visitDate, visitTime),
        visit_type: visitType, status: 'planned',
      } as never)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-visits'] }),
  })

  // Determine which dialog to show based on fromStage → toStage
  function getDialogType(): 'plan_visit' | 'confirm_visit' | 'feedback_visit' | 'enter_negociation' | 'reason' | 'simple' {
    // To relancement or perdue from anywhere
    if (toStage === 'relancement' || toStage === 'perdue') return 'reason'
    // From relancement/perdue back to accueil
    if ((fromStage === 'relancement' || fromStage === 'perdue') && toStage === 'accueil') return 'simple'

    // Specific transitions
    if (toStage === 'visite_a_gerer') return 'plan_visit'
    if (toStage === 'visite_confirmee') return 'confirm_visit'
    if (toStage === 'visite_terminee') return 'feedback_visit'
    if (toStage === 'negociation') return 'enter_negociation'

    // Default
    return 'simple'
  }

  const dialogType = getDialogType()

  function handleConfirm() {
    let finalNote = note

    switch (dialogType) {
      case 'plan_visit':
        if (!visitDate || !visitTime) { toast.error(t('toast.date_time_required')); return }
        createVisit.mutate()
        finalNote = `Visite planifiee: ${visitDate} a ${visitTime} (${visitType === 'on_site' ? 'Sur site' : visitType === 'office' ? 'Bureau' : 'Virtuelle'})`
        break

      case 'confirm_visit':
        if (confirmAction === 'cancel') {
          // Go back to accueil instead
          finalNote = 'Visite annulee par le client'
        } else if (confirmAction === 'report') {
          if (!visitDate || !visitTime) { toast.error(t('toast.new_slot_required')); return }
          createVisit.mutate()
          finalNote = `Visite reportee au ${visitDate} a ${visitTime}`
        } else {
          finalNote = 'Visite confirmee par le client'
        }
        break

      case 'feedback_visit':
        if (!visitNote) { toast.error(t('toast.visit_note_required')); return }
        // Update client with visit feedback
        supabase.from('clients').update({
          visit_note: visitNote,
          visit_feedback: visitReserves || null,
        } as never).eq('id', clientId)
        finalNote = `Visite terminee — Note: ${visitNote}/5. Points: ${visitPoints.join(', ')}. ${visitReserves ? 'Reserves: ' + visitReserves : ''}`
        break

      case 'enter_negociation':
        if (budget) {
          supabase.from('clients').update({ confirmed_budget: parseInt(budget) || null } as never).eq('id', clientId)
        }
        finalNote = `Entree en negociation${budget ? '. Budget confirme: ' + parseInt(budget).toLocaleString('fr') + ' DA' : ''}`
        break

      case 'reason':
        if (!reason) { toast.error(t('toast.reason_required')); return }
        finalNote = `${toStage === 'perdue' ? 'Client perdu' : 'Relancement'}: ${reason}${reminderDays ? '. Rappel dans ' + reminderDays + 'j' : ''}`
        if (reminderDays && tenantId) {
          supabase.from('tasks').insert({
            tenant_id: tenantId,
            client_id: clientId,
            agent_id: userId ?? null,
            title: `Rappel: relancer ${clientName}`,
            stage: toStage,
            type: 'manual' as const,
            status: 'pending' as const,
            channel: 'whatsapp',
            priority: 'medium',
            scheduled_at: new Date(Date.now() + parseInt(reminderDays) * 86400000).toISOString(),
          })
        }
        break
    }

    if (note && finalNote && !finalNote.includes(note)) finalNote += '. ' + note
    onConfirm(finalNote)
    resetForm()
  }

  function resetForm() {
    setNote(''); setVisitDate(''); setVisitTime(''); setVisitType('on_site')
    setVisitNote(0); setVisitPoints([]); setVisitReserves('')
    setConfirmAction('confirm'); setBudget(''); setReason(''); setReminderDays('')
  }

  function handleClose() { resetForm(); onClose() }

  const VISIT_POINTS = ['Emplacement', 'Surface', 'Prix', 'Finitions', 'Vue', 'Luminosite', 'Agencement', 'Parking']
  const LOSS_REASONS = ['Prix trop eleve', 'Achete chez un concurrent', 'Mauvais timing', 'Localisation', 'Finitions', 'Probleme financement', 'Changement plans personnels', 'Pas de suivi suffisant']
  const RELAUNCH_REASONS = ['Client indecis', 'Pas de reponse', 'Budget non disponible', 'Attend livraison', 'Projet en pause']

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={dialogType === 'reason' ? (toStage === 'perdue' ? 'Client perdu' : 'Relancement') : 'Changement d\'etape'} size="md">
      <div className="space-y-4">
        {/* Client + transition */}
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-primary p-3">
          <p className="mb-2 text-sm font-semibold text-immo-text-primary">{clientName}</p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{backgroundColor: from.color + '15', color: from.color}}>
              {from.label}
            </span>
            <ArrowRight className="h-4 w-4 text-immo-text-muted" />
            <span className="flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-[10px] font-bold" style={{borderColor: to.color, color: to.color, backgroundColor: to.color + '10'}}>
              {to.label}
            </span>
          </div>
        </div>

        {/* ═══ PLAN VISIT ═══ */}
        {dialogType === 'plan_visit' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-immo-text-primary">
              <Calendar className="h-4 w-4 text-immo-accent-blue" /> Planifier la visite
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-immo-text-muted">Date *</label>
                <Input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="border-immo-border-default" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-immo-text-muted">Heure *</label>
                <select value={visitTime} onChange={e => setVisitTime(e.target.value)} className="h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
                  <option value="">Choisir</option>
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-immo-text-muted">Type de visite</label>
              <div className="flex gap-2">
                {[{v:'on_site',l:'Sur site',i:MapPin},{v:'office',l:'Bureau',i:Building2},{v:'virtual',l:'Virtuelle',i:Calendar}].map(t => (
                  <button key={t.v} onClick={() => setVisitType(t.v)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all ${visitType === t.v ? 'border-immo-accent-blue bg-immo-accent-blue/10 text-immo-accent-blue' : 'border-immo-border-default text-immo-text-muted'}`}>
                    <t.i className="h-3.5 w-3.5" /> {t.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ CONFIRM/REPORT/CANCEL VISIT ═══ */}
        {dialogType === 'confirm_visit' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {([{v:'confirm' as const,l:'Confirmer',c:'immo-accent-green'},{v:'report' as const,l:'Reporter',c:'immo-status-orange'},{v:'cancel' as const,l:'Annuler',c:'immo-status-red'}]).map(a => (
                <button key={a.v} onClick={() => setConfirmAction(a.v)}
                  className={`flex-1 rounded-lg border-2 py-2.5 text-xs font-semibold transition-all ${confirmAction === a.v ? `border-${a.c} bg-${a.c}/10 text-${a.c}` : 'border-immo-border-default text-immo-text-muted'}`}>
                  {a.l}
                </button>
              ))}
            </div>
            {confirmAction === 'report' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-immo-text-muted">Nouvelle date</label>
                  <Input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="border-immo-border-default" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-immo-text-muted">Nouvelle heure</label>
                  <select value={visitTime} onChange={e => setVisitTime(e.target.value)} className="h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm">
                    <option value="">Choisir</option>
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )}
            {confirmAction === 'cancel' && (
              <div className="rounded-lg border border-immo-status-red/20 bg-immo-status-red/5 p-3">
                <p className="text-xs text-immo-status-red">Le client sera remis en etape "Accueil".</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ VISIT FEEDBACK ═══ */}
        {dialogType === 'feedback_visit' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-immo-text-primary">
              <Star className="h-4 w-4 text-immo-status-orange" /> Feedback de la visite
            </div>
            {/* Rating */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-immo-text-muted">Note du client *</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setVisitNote(n)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 text-sm font-bold transition-all ${visitNote >= n ? 'border-immo-status-orange bg-immo-status-orange/10 text-immo-status-orange' : 'border-immo-border-default text-immo-text-muted'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {/* Points positifs */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-immo-text-muted">Points positifs</label>
              <div className="flex flex-wrap gap-1.5">
                {VISIT_POINTS.map(p => (
                  <button key={p} onClick={() => setVisitPoints(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${visitPoints.includes(p) ? 'border-immo-accent-green bg-immo-accent-green/10 text-immo-accent-green' : 'border-immo-border-default text-immo-text-muted'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {/* Reserves */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-immo-text-muted">Reserves / points negatifs</label>
              <textarea value={visitReserves} onChange={e => setVisitReserves(e.target.value)} rows={2} placeholder="Ex: Le prix est un peu eleve, veut comparer..."
                className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-xs text-immo-text-primary" />
            </div>
          </div>
        )}

        {/* ═══ ENTER NEGOCIATION ═══ */}
        {dialogType === 'enter_negociation' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-immo-text-primary">
              <DollarSign className="h-4 w-4 text-immo-accent-green" /> Entree en negociation
            </div>
            <p className="text-xs text-immo-text-muted">Le client est pret a negocier. Confirmez son budget si disponible.</p>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-immo-text-muted">Budget confirme (DA)</label>
              <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Ex: 15000000" className="border-immo-border-default" />
            </div>
          </div>
        )}

        {/* ═══ REASON (Relancement / Perdue) ═══ */}
        {dialogType === 'reason' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-immo-text-primary">
              {toStage === 'perdue' ? <XCircle className="h-4 w-4 text-immo-status-red" /> : <RotateCcw className="h-4 w-4 text-immo-status-orange" />}
              {toStage === 'perdue' ? 'Raison de la perte' : 'Raison du relancement'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(toStage === 'perdue' ? LOSS_REASONS : RELAUNCH_REASONS).map(r => (
                <button key={r} onClick={() => setReason(r)}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all ${reason === r
                    ? toStage === 'perdue' ? 'border-immo-status-red bg-immo-status-red/10 text-immo-status-red' : 'border-immo-status-orange bg-immo-status-orange/10 text-immo-status-orange'
                    : 'border-immo-border-default text-immo-text-muted'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            {toStage === 'relancement' && (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-immo-text-muted">Rappeler dans</label>
                <select value={reminderDays} onChange={e => setReminderDays(e.target.value)} className="h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm">
                  <option value="">Pas de rappel</option>
                  <option value="3">3 jours</option>
                  <option value="7">1 semaine</option>
                  <option value="14">2 semaines</option>
                  <option value="30">1 mois</option>
                  <option value="90">3 mois</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* ═══ SIMPLE (retour pipeline) ═══ */}
        {dialogType === 'simple' && (
          <p className="text-sm text-immo-text-secondary">
            Remettre <strong>{clientName}</strong> dans le pipeline actif ?
          </p>
        )}

        {/* Note optionnelle (toujours visible sauf simple) */}
        {dialogType !== 'simple' && (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-immo-text-muted">Note supplementaire</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Remarques, prochaine action..."
              className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-xs text-immo-text-primary" />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-immo-border-default pt-4">
          <Button variant="ghost" onClick={handleClose} disabled={loading} className="text-immo-text-secondary">Annuler</Button>
          <Button onClick={handleConfirm} disabled={loading}
            className={`font-semibold text-white ${toStage === 'perdue' ? 'bg-immo-status-red hover:bg-immo-status-red/90' : 'bg-immo-accent-green hover:bg-immo-accent-green/90'}`}>
            {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Confirmer'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
