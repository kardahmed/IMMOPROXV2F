// CallScriptModal — full-screen call assistant for pipeline / client
// detail. Renders the shared CallScriptBody (script + questions +
// objection AI handler + notes) on the left, and a tenant-specific
// "Récapitulatif" sidebar on the right with the answer summary,
// outcome selector, inline visit booking, and the save CTA that
// writes call_responses + history + maps answers back to the client.

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Phone, Clock, Sparkles, CheckCircle, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { appendClientNote } from '@/lib/clientNotes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'
import toast from 'react-hot-toast'
import { CallScriptBody, type CallScript, type ClientQA } from '../CallScriptBody'
import { formatSecondsAsMmss } from '@/lib/format'

interface CallScriptModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  clientPhone: string
  clientStage: PipelineStage
  tenantId: string
  agentId: string
}

export function CallScriptModal({
  isOpen, onClose, clientId, clientName, clientPhone, clientStage, tenantId, agentId,
}: CallScriptModalProps) {
  const qc = useQueryClient()
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [clientQA, setClientQA] = useState<ClientQA[]>([])
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<'qualified' | 'callback' | 'not_interested'>('qualified')
  const [saving, setSaving] = useState(false)
  const [timer, setTimer] = useState(0)
  const [script, setScript] = useState<CallScript | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    if (isOpen) {
      setTimer(0)
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isOpen])

  const [showVisitForm, setShowVisitForm] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [visitTime, setVisitTime] = useState('')

  const createVisit = useMutation({
    mutationFn: async () => {
      if (!visitDate || !visitTime) return
      const { error } = await supabase.from('visits').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: agentId,
        scheduled_at: `${visitDate}T${visitTime}:00`,
        visit_type: 'on_site', status: 'planned',
      } as never)
      if (error) { handleSupabaseError(error); throw error }
      await supabase.from('history').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: agentId,
        type: 'visit_planned', title: `Visite planifiée depuis appel — ${visitDate} ${visitTime}`,
      } as never)
      if (clientStage === 'accueil') {
        await supabase.from('clients').update({ pipeline_stage: 'visite_a_gerer' } as never).eq('id', clientId)
      }
    },
    onSuccess: () => {
      toast.success('Visite planifiée !')
      setShowVisitForm(false)
      qc.invalidateQueries({ queryKey: ['client-visits'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
  })

  async function handleSave() {
    setSaving(true)
    if (timerRef.current) clearInterval(timerRef.current)

    try {
      await supabase.from('call_responses').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: agentId,
        script_id: script?.script_id ?? null,
        responses: { ...answers, _client_qa: clientQA.map(q => ({ q: q.question, a: q.answer })) },
        duration_seconds: timer,
        result,
        ai_summary: notes || null,
        ai_suggestion: script?.suggested_action ?? null,
      } as never)

      // Map mapped answers back to the client record (budget, types,
      // interest_level, payment_method) — same logic as the previous
      // version, just localised to live with the save.
      const clientUpdate: Record<string, unknown> = {}
      for (const q of script?.questions ?? []) {
        if (q.maps_to && answers[q.id]) {
          const val = answers[q.id]
          if (q.maps_to === 'confirmed_budget') clientUpdate.confirmed_budget = Number(val) || null
          else if (q.maps_to === 'desired_unit_types') clientUpdate.desired_unit_types = Array.isArray(val) ? val : [val]
          else if (q.maps_to === 'interest_level') {
            const map: Record<string, string> = { 'Oui, urgent': 'high', 'Oui, pas presse': 'medium', 'Juste en veille': 'low', 'Chaud': 'high', 'Tiede': 'medium', 'Froid': 'low' }
            clientUpdate.interest_level = map[val as string] ?? val
          } else if (q.maps_to === 'payment_method') {
            const map: Record<string, string> = { 'Comptant': 'cash', 'Credit bancaire': 'bank_loan', 'Mixte': 'mixed' }
            clientUpdate.payment_method = map[val as string] ?? 'installments'
          }
        }
      }
      if (Object.keys(clientUpdate).length > 0) {
        await supabase.from('clients').update(clientUpdate as never).eq('id', clientId)
      }

      const qaText = clientQA.length > 0 ? clientQA.map(q => `Q: ${q.question} → R: ${q.answer}`).join('\n') : ''
      const fullNotes = [notes, qaText].filter(Boolean).join('\n\n')
      if (fullNotes) {
        const resultLabel = result === 'qualified' ? 'Qualifié' : result === 'callback' ? 'À rappeler' : 'Pas intéressé'
        await appendClientNote(clientId, `📞 Appel guidé — ${resultLabel} (${Math.floor(timer / 60)}min)`, fullNotes)
      }

      const answeredCount = Object.keys(answers).length
      const totalQuestions = script?.questions?.length ?? 0
      await supabase.from('history').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: agentId,
        type: 'call',
        title: `Appel guidé ${Math.floor(timer / 60)}min — ${result === 'qualified' ? 'Qualifié' : result === 'callback' ? 'À rappeler' : 'Pas intéressé'} (${answeredCount}/${totalQuestions} questions)`,
        metadata: { duration: timer, result, answers_count: answeredCount, mode: script?.mode },
      } as never)

      toast.success('Appel enregistré et fiche client mise à jour')
      qc.invalidateQueries({ queryKey: ['client-detail'] })
      qc.invalidateQueries({ queryKey: ['client-history'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const stage = PIPELINE_STAGES[clientStage]
  const formatTime = formatSecondsAsMmss

  return (
    <div className="fixed inset-0 z-50 flex h-screen flex-col overflow-hidden bg-immo-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-immo-border-default bg-immo-bg-card px-6 py-3">
        <div className="flex items-center gap-4">
          <Phone className="h-5 w-5 text-immo-accent-green" />
          <div>
            <h2 className="text-sm font-bold text-immo-text-primary">{clientName}</h2>
            <div className="flex items-center gap-2 text-xs text-immo-text-muted">
              <span>{clientPhone}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: stage.color + '15', color: stage.color }}>{stage.label}</span>
              {script?.mode === 'ai' && <span className="flex items-center gap-1 text-purple-500"><Sparkles className="h-3 w-3" /> IA</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 rounded-lg bg-immo-accent-green/10 px-3 py-1.5">
            <Clock className="h-4 w-4 text-immo-accent-green" />
            <span className="font-mono text-sm font-bold text-immo-accent-green">{formatTime(timer)}</span>
          </div>
          <button onClick={onClose} aria-label="Fermer l'appel" className="rounded-md p-1.5 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Left: Shared script body */}
        <div className="flex-[3] overflow-y-auto border-b border-immo-border-default p-3 md:border-b-0 md:border-r md:p-6">
          <CallScriptBody
            clientId={clientId}
            clientName={clientName}
            clientStage={clientStage}
            tenantId={tenantId}
            agentId={agentId}
            notes={notes}
            onNotesChange={setNotes}
            answers={answers}
            onAnswersChange={setAnswers}
            clientQA={clientQA}
            onClientQAChange={setClientQA}
            onScriptLoaded={setScript}
            hideNotes  /* notes textarea lives in the right sidebar here */
          />
        </div>

        {/* Right: outcome sidebar */}
        <div className="flex w-full shrink-0 flex-col overflow-hidden bg-immo-bg-card md:w-[380px]">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <h3 className="mb-4 text-sm font-bold text-immo-text-primary">Récapitulatif</h3>

            {/* Answers summary */}
            <div className="mb-4 space-y-2">
              {script?.questions.filter(q => answers[q.id]).map(q => (
                <div key={q.id} className="rounded-lg bg-immo-bg-primary p-2.5">
                  <p className="text-[10px] text-immo-text-muted">{q.question}</p>
                  <p className="text-xs font-medium text-immo-text-primary">
                    {Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).join(', ') : answers[q.id]}
                  </p>
                </div>
              )) ?? null}
              {Object.keys(answers).length === 0 && (
                <p className="py-4 text-center text-xs text-immo-text-muted">Les réponses apparaîtront ici</p>
              )}
            </div>

            {/* Notes (right-side variant) */}
            <div className="mb-4">
              <label className="mb-1 block text-[10px] font-medium text-immo-text-muted">Notes supplémentaires</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Impressions, remarques…"
                className="w-full resize-none rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-xs text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:outline-none" />
            </div>

            {/* Outcome */}
            <div className="mb-4">
              <label className="mb-2 block text-[10px] font-medium text-immo-text-muted">Résultat de l'appel</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'qualified' as const, label: 'Qualifié', color: 'text-immo-accent-green border-immo-accent-green/30 bg-immo-accent-green/5' },
                  { value: 'callback' as const, label: 'À rappeler', color: 'text-immo-status-orange border-immo-status-orange/30 bg-immo-status-orange/5' },
                  { value: 'not_interested' as const, label: 'Pas intéressé', color: 'text-immo-status-red border-immo-status-red/30 bg-immo-status-red/5' },
                ]).map(r => (
                  <button key={r.value} onClick={() => setResult(r.value)}
                    className={`rounded-lg border px-2 py-2 text-[11px] font-medium transition-all ${result === r.value ? r.color : 'border-immo-border-default text-immo-text-muted'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <AvailabilityMini agentId={agentId} tenantId={tenantId} />

            <div className="mb-4">
              {!showVisitForm ? (
                <Button onClick={() => setShowVisitForm(true)} className="w-full border border-immo-accent-blue/30 bg-immo-accent-blue/5 text-xs font-semibold text-immo-accent-blue hover:bg-immo-accent-blue/10">
                  <Calendar className="mr-1.5 h-3.5 w-3.5" /> Proposer une visite
                </Button>
              ) : (
                <div className="space-y-2 rounded-lg border border-immo-accent-blue/30 bg-immo-accent-blue/5 p-3">
                  <p className="text-[10px] font-semibold text-immo-accent-blue">Planifier une visite</p>
                  <Input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="h-8 border-immo-border-default text-xs" />
                  <select value={visitTime} onChange={e => setVisitTime(e.target.value)} className="h-8 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-2 text-xs text-immo-text-primary">
                    <option value="">Heure</option>
                    {['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <Button onClick={() => createVisit.mutate()} disabled={!visitDate || !visitTime || createVisit.isPending} className="h-7 flex-1 bg-immo-accent-blue text-[10px] text-white">
                      {createVisit.isPending ? '...' : 'Confirmer visite'}
                    </Button>
                    <Button onClick={() => setShowVisitForm(false)} className="h-7 border border-immo-border-default bg-transparent text-[10px] text-immo-text-muted">Annuler</Button>
                  </div>
                </div>
              )}
            </div>

            {script?.suggested_action && (
              <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3">
                <p className="text-[10px] font-medium text-purple-500">Suggestion IA</p>
                <p className="text-xs font-medium text-purple-700">{script.suggested_action}</p>
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="shrink-0 border-t border-immo-border-default bg-immo-bg-card p-4">
            <Button onClick={handleSave} disabled={saving} className="w-full bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90">
              {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> :
                <><CheckCircle className="mr-1.5 h-4 w-4" /> Sauvegarder et fermer</>
              }
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Mini availability calendar — reads tenant visit settings.
function AvailabilityMini({ agentId, tenantId }: { agentId: string; tenantId: string }) {
  const { data: visitSettings } = useQuery({
    queryKey: ['tenant-visit-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings').select('work_days, visit_slots, visit_duration_minutes').eq('tenant_id', tenantId).single()
      return data as { work_days: number[] | null; visit_slots: string[] | null; visit_duration_minutes: number | null } | null
    },
    staleTime: 300_000,
  })

  const { data: existingVisits } = useQuery({
    queryKey: ['agent-availability', agentId],
    queryFn: async () => {
      const now = new Date()
      const nextWeek = new Date(now.getTime() + 7 * 86400000)
      const { data } = await supabase
        .from('visits')
        .select('scheduled_at')
        .eq('agent_id', agentId)
        .eq('tenant_id', tenantId)
        .gte('scheduled_at', now.toISOString())
        .lte('scheduled_at', nextWeek.toISOString())
        .in('status', ['planned', 'confirmed'])
        .order('scheduled_at')
      return (data ?? []) as Array<{ scheduled_at: string }>
    },
    staleTime: 60_000,
  })

  const workDays = visitSettings?.work_days ?? [0, 1, 2, 3, 4]
  const timeSlots = visitSettings?.visit_slots ?? ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
  const duration = visitSettings?.visit_duration_minutes ?? 45
  const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

  const days: Array<{ label: string; shortDay: string; slots: string[]; occupiedSlots: string[] }> = []
  let d = new Date()
  d.setHours(0, 0, 0, 0)
  let count = 0
  while (count < 5) {
    d = new Date(d.getTime() + 86400000)
    const dow = d.getDay()
    if (!workDays.includes(dow)) continue
    const dateStr = d.toISOString().split('T')[0]
    const occupied = (existingVisits ?? [])
      .filter(s => s.scheduled_at.startsWith(dateStr))
      .map(s => { const h = new Date(s.scheduled_at); return `${h.getHours().toString().padStart(2, '0')}:${h.getMinutes().toString().padStart(2, '0')}` })
    days.push({
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      shortDay: DAY_NAMES[dow],
      slots: timeSlots,
      occupiedSlots: occupied,
    })
    count++
  }

  return (
    <div className="mb-4 rounded-lg border border-immo-accent-blue/20 bg-immo-accent-blue/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold text-immo-accent-blue">Disponibilités</p>
        <span className="text-[8px] text-immo-text-muted">Visite : {duration} min</span>
      </div>
      <div className="flex gap-1">
        {days.map(day => (
          <div key={day.label} className="flex-1 text-center">
            <p className="text-[8px] font-bold text-immo-text-muted">{day.shortDay}</p>
            <p className="mb-1 text-[9px] text-immo-text-secondary">{day.label}</p>
            <div className="space-y-0.5">
              {day.slots.map(slot => {
                const isOccupied = day.occupiedSlots.includes(slot)
                return (
                  <div
                    key={slot}
                    className={`rounded px-0.5 py-0.5 text-[7px] font-medium ${
                      isOccupied
                        ? 'bg-immo-status-red/10 text-immo-status-red line-through'
                        : 'bg-immo-accent-green/10 text-immo-accent-green'
                    }`}
                  >
                    {slot}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-center text-[8px] text-immo-text-muted">Vert = libre · Rouge = occupé</p>
    </div>
  )
}
