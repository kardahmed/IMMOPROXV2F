import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Save, Plus, X, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

const ALL_DAYS = [
  { value: 0, label: 'Dimanche' },
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
]

// Build the canonical slot list from work hours + lunch break +
// duration. Mirrors the slot generator in VisitsTab so the visit
// modal and the settings page agree on what's a valid slot.
function computeAutoSlots(startH: number, endH: number, durationMin: number, lunchStart: number, lunchEnd: number): string[] {
  const out: string[] = []
  const startMin = startH * 60
  const endMin = endH * 60
  const lunchStartMin = lunchStart * 60
  const lunchEndMin = lunchEnd * 60
  for (let m = startMin; m + durationMin <= endMin; m += durationMin) {
    // Skip slots that fall inside the lunch break (any overlap).
    if (m < lunchEndMin && m + durationMin > lunchStartMin) continue
    const h = Math.floor(m / 60)
    const mm = m % 60
    out.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
  }
  return out
}

function isSlotValid(slot: string, startH: number, endH: number, durationMin: number, lunchStart: number, lunchEnd: number): { ok: boolean; reason?: string } {
  const m = parseInt(slot.slice(0, 2)) * 60 + parseInt(slot.slice(3, 5))
  if (m < startH * 60) return { ok: false, reason: `Avant ouverture (${startH}h)` }
  if (m + durationMin > endH * 60) return { ok: false, reason: `Dépasse fermeture (${endH}h)` }
  if (m < lunchEnd * 60 && m + durationMin > lunchStart * 60) {
    return { ok: false, reason: `Dans la pause déjeuner (${lunchStart}h-${lunchEnd}h)` }
  }
  return { ok: true }
}

export function VisitScheduleSection() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['tenant-visit-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings').select('work_days, work_start_hour, work_end_hour, visit_duration_minutes, visit_slots, lunch_break_start, lunch_break_end').eq('tenant_id', tenantId!).single()
      return data as {
        work_days: number[]
        work_start_hour: number
        work_end_hour: number
        visit_duration_minutes: number
        visit_slots: string[]
        lunch_break_start: number
        lunch_break_end: number
      } | null
    },
    enabled: !!tenantId,
  })

  const [workDays, setWorkDays] = useState<number[]>([0, 1, 2, 3, 4])
  const [startHour, setStartHour] = useState(9)
  const [endHour, setEndHour] = useState(17)
  const [duration, setDuration] = useState(45)
  const [slots, setSlots] = useState<string[]>(['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'])
  const [lunchStart, setLunchStart] = useState(12)
  const [lunchEnd, setLunchEnd] = useState(14)
  const [newSlot, setNewSlot] = useState('')

  useEffect(() => {
    if (settings) {
      setWorkDays(settings.work_days ?? [0, 1, 2, 3, 4])
      setStartHour(settings.work_start_hour ?? 9)
      setEndHour(settings.work_end_hour ?? 17)
      setDuration(settings.visit_duration_minutes ?? 45)
      setSlots(settings.visit_slots ?? ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'])
      setLunchStart(settings.lunch_break_start ?? 12)
      setLunchEnd(settings.lunch_break_end ?? 14)
    }
  }, [settings])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tenant_settings').update({
        work_days: workDays,
        work_start_hour: startHour,
        work_end_hour: endHour,
        visit_duration_minutes: duration,
        visit_slots: slots.sort(),
        lunch_break_start: lunchStart,
        lunch_break_end: lunchEnd,
      } as never).eq('tenant_id', tenantId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-visit-settings'] })
      toast.success('Paramètres de visite enregistrés')
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  })

  function toggleDay(day: number) {
    setWorkDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort())
  }

  function addSlot() {
    if (!newSlot || slots.includes(newSlot)) return
    const valid = isSlotValid(newSlot, startHour, endHour, duration, lunchStart, lunchEnd)
    if (!valid.ok) {
      toast.error(`Créneau ${newSlot} invalide : ${valid.reason}`)
      return
    }
    setSlots(prev => [...prev, newSlot].sort())
    setNewSlot('')
  }

  // Slots that fall outside work hours / inside lunch / past closing
  // — we surface them with a warning chip so the user notices before
  // saving. The "Régénérer auto" button rebuilds from scratch.
  const slotIssues = useMemo(() => {
    const out: Record<string, string> = {}
    for (const s of slots) {
      const v = isSlotValid(s, startHour, endHour, duration, lunchStart, lunchEnd)
      if (!v.ok && v.reason) out[s] = v.reason
    }
    return out
  }, [slots, startHour, endHour, duration, lunchStart, lunchEnd])

  function regenerateSlots() {
    const auto = computeAutoSlots(startHour, endHour, duration, lunchStart, lunchEnd)
    setSlots(auto)
    toast.success(`${auto.length} créneaux générés depuis vos horaires`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-immo-text-primary">Planification des visites</h2>
        <p className="text-xs text-immo-text-muted">Configurez les horaires de travail et les creneaux de visite de votre agence</p>
      </div>

      {/* Jours de travail */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Jours de travail</h3>
        <div className="flex flex-wrap gap-2">
          {ALL_DAYS.map(day => (
            <button
              key={day.value}
              onClick={() => toggleDay(day.value)}
              className={`rounded-lg border px-4 py-2 text-xs font-medium transition-all ${
                workDays.includes(day.value)
                  ? 'border-immo-accent-green/50 bg-immo-accent-green/10 text-immo-accent-green'
                  : 'border-immo-border-default text-immo-text-muted hover:border-immo-accent-green/30'
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-immo-text-muted">
          Les jours non selectionnes sont consideres comme fermes. Les visites ne seront pas proposees ces jours-la.
        </p>
      </div>

      {/* Horaires */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Horaires de travail</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Ouverture</label>
            <div className="flex items-center gap-2">
              <Input type="number" min={6} max={12} value={startHour} onChange={e => setStartHour(Number(e.target.value))} className="w-20 text-sm text-center" />
              <span className="text-xs text-immo-text-muted">h 00</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Fermeture</label>
            <div className="flex items-center gap-2">
              <Input type="number" min={14} max={22} value={endHour} onChange={e => setEndHour(Number(e.target.value))} className="w-20 text-sm text-center" />
              <span className="text-xs text-immo-text-muted">h 00</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Pause dejeuner debut</label>
            <div className="flex items-center gap-2">
              <Input type="number" min={11} max={14} value={lunchStart} onChange={e => setLunchStart(Number(e.target.value))} className="w-20 text-sm text-center" />
              <span className="text-xs text-immo-text-muted">h 00</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Pause dejeuner fin</label>
            <div className="flex items-center gap-2">
              <Input type="number" min={12} max={16} value={lunchEnd} onChange={e => setLunchEnd(Number(e.target.value))} className="w-20 text-sm text-center" />
              <span className="text-xs text-immo-text-muted">h 00</span>
            </div>
          </div>
        </div>
      </div>

      {/* Duree de visite */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Duree de visite</h3>
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-immo-text-muted" />
          <div className="flex gap-2">
            {[30, 45, 60, 90].map(m => (
              <button
                key={m}
                onClick={() => setDuration(m)}
                className={`rounded-lg border px-4 py-2 text-xs font-medium transition-all ${
                  duration === m
                    ? 'border-immo-accent-blue/50 bg-immo-accent-blue/10 text-immo-accent-blue'
                    : 'border-immo-border-default text-immo-text-muted hover:border-immo-accent-blue/30'
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Creneaux de visite */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-immo-text-primary">Créneaux de visite disponibles</h3>
          <Button size="sm" onClick={regenerateSlots} className="border border-immo-accent-blue/30 bg-immo-accent-blue/5 text-xs text-immo-accent-blue hover:bg-immo-accent-blue/10">
            <RefreshCw className="me-1 h-3 w-3" /> Régénérer auto
          </Button>
        </div>

        {Object.keys(slotIssues).length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-immo-status-orange/30 bg-immo-status-orange/5 p-2.5 text-[11px] text-immo-status-orange">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="font-semibold">{Object.keys(slotIssues).length} créneau(x) incohérent(s) avec vos horaires.</p>
              <p>Cliquez "Régénérer auto" pour recalculer depuis ouverture/fermeture/pause/durée.</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {slots.map(slot => {
            const issue = slotIssues[slot]
            return (
              <div
                key={slot}
                title={issue ?? ''}
                className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 ${
                  issue
                    ? 'border-immo-status-orange/50 bg-immo-status-orange/10'
                    : 'border-immo-accent-green/30 bg-immo-accent-green/5'
                }`}
              >
                {issue && <AlertTriangle className="h-3 w-3 text-immo-status-orange" />}
                <span className={`text-xs font-medium ${issue ? 'text-immo-status-orange' : 'text-immo-accent-green'}`}>{slot}</span>
                <button onClick={() => setSlots(prev => prev.filter(s => s !== slot))} className="text-immo-text-muted hover:text-immo-status-red">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Input
            type="time"
            value={newSlot}
            onChange={e => setNewSlot(e.target.value)}
            className="w-32 text-sm"
          />
          <Button size="sm" onClick={addSlot} disabled={!newSlot} className="border border-immo-border-default bg-transparent text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover">
            <Plus className="me-1 h-3 w-3" /> Ajouter
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-immo-text-muted">
          Ces créneaux sont proposés aux agents dans le calendrier de visite. Hors horaires de travail / pause = invalides.
        </p>
      </div>

      {/* Apercu */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <h3 className="mb-2 text-sm font-semibold text-immo-text-primary">Apercu</h3>
        <p className="text-xs text-immo-text-secondary">
          Votre agence est ouverte le{' '}
          <strong>{workDays.map(d => ALL_DAYS.find(a => a.value === d)?.label).join(', ')}</strong>
          {' '}de <strong>{startHour}h</strong> a <strong>{endHour}h</strong>
          {' '}(pause {lunchStart}h-{lunchEnd}h).
          Les visites durent <strong>{duration} minutes</strong> avec{' '}
          <strong>{slots.length} creneaux</strong> disponibles par jour.
        </p>
      </div>

      {/* Save */}
      <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90">
        <Save className="me-1.5 h-4 w-4" /> {save.isPending ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </div>
  )
}
