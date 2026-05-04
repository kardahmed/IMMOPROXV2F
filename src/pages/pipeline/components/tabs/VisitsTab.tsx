import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Plus, CheckCircle, X, RotateCw, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge, EmptyState, Modal, ConfirmDialog } from '@/components/common'
import { VISIT_STATUS_LABELS } from '@/types'
import type { VisitStatus } from '@/types'
import { format, isAfter } from 'date-fns'
import toast from 'react-hot-toast'
import { inputClass } from './shared'
import { algerianDateTimeToISO } from '@/lib/algerianDate'

interface VisitRow {
  id: string
  scheduled_at: string
  visit_type: string
  status: VisitStatus
  notes: string | null
  agent_id: string | null
  users: { first_name: string; last_name: string } | null
}

interface TenantVisitSettings {
  work_days: number[]
  work_start_hour: number
  work_end_hour: number
  visit_duration_minutes: number
  visit_slots: string[]
  lunch_break_start: number | null
  lunch_break_end: number | null
}

const DEFAULT_SETTINGS: TenantVisitSettings = {
  work_days: [0, 1, 2, 3, 4],            // Sun → Thu (Algerian work week)
  work_start_hour: 9,
  work_end_hour: 17,
  visit_duration_minutes: 45,
  visit_slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
  lunch_break_start: 12,
  lunch_break_end: 14,
}

export function VisitsTab({ clientId, tenantId }: { clientId: string; tenantId: string }) {
  const { t } = useTranslation()
  const [showCreate, setShowCreate] = useState(false)
  const [reschedule, setReschedule] = useState<VisitRow | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<VisitRow | null>(null)
  const userId = useAuthStore((s) => s.session?.user?.id)
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['tenant-visit-settings', tenantId],
    queryFn: async (): Promise<TenantVisitSettings> => {
      const { data } = await supabase
        .from('tenant_settings')
        .select('work_days, work_start_hour, work_end_hour, visit_duration_minutes, visit_slots, lunch_break_start, lunch_break_end')
        .eq('tenant_id', tenantId)
        .single()
      const s = data as Partial<TenantVisitSettings> | null
      return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ['client-visits', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visits')
        .select('id, scheduled_at, visit_type, status, notes, agent_id, users!visits_agent_id_fkey(first_name, last_name)')
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('scheduled_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return (data ?? []) as unknown as VisitRow[]
    },
  })

  // Used by the slot picker to grey out times already booked by THIS
  // agent on the chosen date. Avoids double-booking the same slot.
  const { data: agentBookedTimes = new Set<string>() } = useQuery({
    queryKey: ['agent-booked-slots', userId],
    queryFn: async () => {
      if (!userId) return new Set<string>()
      const { data } = await supabase
        .from('visits')
        .select('scheduled_at')
        .eq('agent_id', userId)
        .in('status', ['planned', 'confirmed'])
        .is('deleted_at', null)
      const set = new Set<string>()
      for (const r of (data ?? []) as Array<{ scheduled_at: string }>) {
        // Index by full timestamp (ISO) — slot picker computes the
        // expected ISO for each candidate slot and checks membership.
        set.add(r.scheduled_at)
      }
      return set
    },
    enabled: !!userId,
  })

  const createVisit = useMutation({
    mutationFn: async (input: { date: string; time: string; visit_type: string; notes: string }) => {
      const scheduled_at = algerianDateTimeToISO(input.date, input.time)
      const { error } = await supabase.from('visits').insert({
        tenant_id: tenantId,
        client_id: clientId,
        agent_id: userId!,
        scheduled_at,
        visit_type: input.visit_type,
        notes: input.notes || null,
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-visits', clientId] })
      qc.invalidateQueries({ queryKey: ['agent-booked-slots'] })
      toast.success('Visite planifiée')
      setShowCreate(false)
      setReschedule(null)
    },
  })

  const updateStatus = useMutation({
    mutationFn: async ({ visitId, status }: { visitId: string; status: VisitStatus }) => {
      const { error } = await supabase.from('visits').update({ status } as never).eq('id', visitId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-visits', clientId] })
      qc.invalidateQueries({ queryKey: ['agent-booked-slots'] })
      toast.success('Statut mis à jour')
    },
  })

  const cancelVisit = useMutation({
    mutationFn: async (visitId: string) => {
      const { error } = await supabase
        .from('visits')
        .update({ status: 'cancelled' } as never)
        .eq('id', visitId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-visits', clientId] })
      qc.invalidateQueries({ queryKey: ['agent-booked-slots'] })
      toast.success('Visite annulée')
      setConfirmCancel(null)
    },
  })

  const rescheduleVisit = useMutation({
    mutationFn: async ({ visitId, date, time }: { visitId: string; date: string; time: string }) => {
      const scheduled_at = algerianDateTimeToISO(date, time)
      const { error } = await supabase
        .from('visits')
        .update({ scheduled_at, status: 'rescheduled' } as never)
        .eq('id', visitId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-visits', clientId] })
      qc.invalidateQueries({ queryKey: ['agent-booked-slots'] })
      toast.success('Visite reprogrammée')
      setReschedule(null)
    },
  })

  const now = new Date()
  const upcoming = visits.filter((v) => isAfter(new Date(v.scheduled_at), now) && v.status !== 'cancelled')
  const past = visits.filter((v) => !isAfter(new Date(v.scheduled_at), now) || v.status === 'cancelled')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-immo-text-secondary">
          {upcoming.length} {t('status.planned').toLowerCase()}, {past.length} {t('status.completed').toLowerCase()}
        </p>
        <Button onClick={() => setShowCreate(true)} className="bg-immo-accent-green text-xs font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
          <Plus className="me-1 h-3.5 w-3.5" /> Nouvelle visite
        </Button>
      </div>

      {visits.length === 0 && !isLoading ? (
        <EmptyState icon={<Calendar className="h-10 w-10" />} title={t('common.no_data')} />
      ) : (
        <>
          {upcoming.length > 0 && (
            <VisitList
              title={t('status.planned')}
              visits={upcoming}
              onConfirm={(v) => updateStatus.mutate({ visitId: v.id, status: 'confirmed' })}
              onComplete={(v) => updateStatus.mutate({ visitId: v.id, status: 'completed' })}
              onReschedule={(v) => setReschedule(v)}
              onCancel={(v) => setConfirmCancel(v)}
              isPending={updateStatus.isPending}
            />
          )}
          {past.length > 0 && (
            <VisitList
              title={t('status.completed')}
              visits={past}
              isPending={updateStatus.isPending}
            />
          )}
        </>
      )}

      <VisitFormModal
        isOpen={showCreate || reschedule !== null}
        onClose={() => { setShowCreate(false); setReschedule(null) }}
        title={reschedule ? 'Reprogrammer la visite' : 'Nouvelle visite'}
        settings={settings ?? DEFAULT_SETTINGS}
        agentBookedTimes={agentBookedTimes}
        initial={reschedule ? {
          date: reschedule.scheduled_at.slice(0, 10),
          time: reschedule.scheduled_at.slice(11, 16),
          visit_type: reschedule.visit_type,
          notes: reschedule.notes ?? '',
        } : null}
        onSubmit={(d) => {
          if (reschedule) rescheduleVisit.mutate({ visitId: reschedule.id, date: d.date, time: d.time })
          else createVisit.mutate(d)
        }}
        loading={createVisit.isPending || rescheduleVisit.isPending}
      />

      <ConfirmDialog
        isOpen={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={() => confirmCancel && cancelVisit.mutate(confirmCancel.id)}
        title="Annuler cette visite ?"
        description={confirmCancel ? `Visite du ${format(new Date(confirmCancel.scheduled_at), 'dd/MM/yyyy à HH:mm')} sera marquée comme annulée. Vous pouvez en reprogrammer une nouvelle ensuite.` : ''}
        confirmLabel="Annuler la visite"
        confirmVariant="danger"
      />
    </div>
  )
}

function VisitList({
  title, visits, onConfirm, onComplete, onReschedule, onCancel, isPending,
}: {
  title: string
  visits: VisitRow[]
  onConfirm?: (v: VisitRow) => void
  onComplete?: (v: VisitRow) => void
  onReschedule?: (v: VisitRow) => void
  onCancel?: (v: VisitRow) => void
  isPending?: boolean
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-immo-text-muted uppercase">{title}</h4>
      <div className="space-y-2">
        {visits.map((v) => {
          const st = VISIT_STATUS_LABELS[v.status] ?? { label: v.status, color: '#7F96B7' }
          const agent = v.users
          const isUpcoming = isAfter(new Date(v.scheduled_at), new Date())
          return (
            <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-immo-text-primary">{format(new Date(v.scheduled_at), 'dd/MM/yyyy HH:mm')}</p>
                <p className="text-[11px] text-immo-text-muted">
                  {v.visit_type} {agent ? `· ${agent.first_name} ${agent.last_name}` : ''}
                </p>
              </div>
              <StatusBadge label={st.label} type={st.color === '#00D4A0' ? 'green' : st.color === '#FF4949' ? 'red' : st.color === '#FF9A1E' ? 'orange' : 'muted'} />
              {isUpcoming && onConfirm && v.status === 'planned' && (
                <Button size="sm" variant="ghost" disabled={isPending}
                  onClick={() => onConfirm(v)}
                  className="h-7 border border-immo-accent-blue/30 text-[11px] text-immo-accent-blue hover:bg-immo-accent-blue/10">
                  <Check className="me-1 h-3 w-3" /> Confirmer
                </Button>
              )}
              {isUpcoming && onComplete && (v.status === 'planned' || v.status === 'confirmed') && (
                <Button size="sm" variant="ghost" disabled={isPending}
                  onClick={() => onComplete(v)}
                  className="h-7 border border-immo-accent-green/30 text-[11px] text-immo-accent-green hover:bg-immo-accent-green/10">
                  <CheckCircle className="me-1 h-3 w-3" /> Terminée
                </Button>
              )}
              {isUpcoming && onReschedule && v.status !== 'cancelled' && v.status !== 'completed' && (
                <Button size="sm" variant="ghost" disabled={isPending}
                  onClick={() => onReschedule(v)}
                  className="h-7 border border-immo-status-orange/30 text-[11px] text-immo-status-orange hover:bg-immo-status-orange/10">
                  <RotateCw className="me-1 h-3 w-3" /> Reprogrammer
                </Button>
              )}
              {isUpcoming && onCancel && v.status !== 'cancelled' && v.status !== 'completed' && (
                <Button size="sm" variant="ghost" disabled={isPending}
                  onClick={() => onCancel(v)}
                  className="h-7 border border-immo-status-red/30 text-[11px] text-immo-status-red hover:bg-immo-status-red/10">
                  <X className="me-1 h-3 w-3" /> Annuler
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VisitFormModal({
  isOpen, onClose, onSubmit, loading, title, settings, agentBookedTimes, initial,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (d: { date: string; time: string; visit_type: string; notes: string }) => void
  loading: boolean
  title: string
  settings: TenantVisitSettings
  agentBookedTimes: Set<string>
  initial: { date: string; time: string; visit_type: string; notes: string } | null
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState(initial?.date ?? '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [type, setType] = useState(initial?.visit_type ?? 'on_site')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  // Today (yyyy-mm-dd) — used as min on the date picker so users
  // can't book in the past.
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Day-of-week of the chosen date (Sun=0…Sat=6). When the chosen
  // day is not in tenant's work_days, refuse the slot and warn.
  const chosenDow = date ? new Date(date + 'T12:00').getDay() : null
  const dayInWorkWeek = chosenDow == null || settings.work_days.includes(chosenDow)

  // Build the slot list. If tenant defined explicit slots, use them.
  // Otherwise generate every visit_duration_minutes from work_start
  // to work_end, skipping the lunch break.
  const slots = useMemo(() => {
    if (settings.visit_slots && settings.visit_slots.length > 0) return settings.visit_slots
    const out: string[] = []
    const dur = settings.visit_duration_minutes || 45
    for (let h = settings.work_start_hour; h < settings.work_end_hour; h++) {
      for (let m = 0; m < 60; m += dur) {
        if (h * 60 + m + dur > settings.work_end_hour * 60) break
        if (settings.lunch_break_start != null && settings.lunch_break_end != null) {
          if (h >= settings.lunch_break_start && h < settings.lunch_break_end) continue
        }
        out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    return out
  }, [settings])

  // Compute which slots are already taken by THIS agent on the
  // chosen date — they show greyed out in the picker.
  const bookedTimesForChosenDate = useMemo(() => {
    if (!date) return new Set<string>()
    const taken = new Set<string>()
    for (const iso of agentBookedTimes) {
      if (iso.startsWith(date)) taken.add(iso.slice(11, 16))
    }
    return taken
  }, [date, agentBookedTimes])

  function handle() {
    if (!date) { toast.error('Sélectionnez une date'); return }
    if (!time) { toast.error('Sélectionnez un créneau horaire'); return }
    if (!dayInWorkWeek) { toast.error("Ce jour n'est pas dans les jours de travail de l'agence"); return }
    if (bookedTimesForChosenDate.has(time)) { toast.error('Ce créneau est déjà réservé'); return }
    onSubmit({ date, time, visit_type: type, notes })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-immo-text-secondary">{t('field.date')} *</Label>
            <Input
              type="date"
              value={date}
              min={todayISO}
              onChange={(e) => { setDate(e.target.value); setTime('') }}
              className={inputClass}
            />
            {date && !dayInWorkWeek && (
              <p className="mt-1 text-[11px] text-immo-status-red">
                Hors jours de travail (jours actifs : {settings.work_days.map(d => ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d]).join(', ')})
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs text-immo-text-secondary">Créneau *</Label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date || !dayInWorkWeek}
              className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass} disabled:opacity-50`}
            >
              <option value="">— Choisir —</option>
              {slots.map((s) => {
                const taken = bookedTimesForChosenDate.has(s)
                return (
                  <option key={s} value={s} disabled={taken}>
                    {s}{taken ? '  (réservé)' : ''}
                  </option>
                )
              })}
            </select>
          </div>
        </div>
        <div>
          <Label className="text-xs text-immo-text-secondary">{t('field.type')}</Label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}
          >
            <option value="on_site">Sur site</option>
            <option value="office">Au bureau</option>
            <option value="virtual">Virtuelle</option>
          </select>
        </div>
        <div>
          <Label className="text-xs text-immo-text-secondary">{t('field.notes')}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes..." className={inputClass} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary">{t('action.cancel')}</Button>
          <Button onClick={handle} disabled={!date || !time || !dayInWorkWeek || loading} className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
            {loading
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-immo-bg-primary border-t-transparent" />
              : initial ? 'Reprogrammer' : t('action.create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
