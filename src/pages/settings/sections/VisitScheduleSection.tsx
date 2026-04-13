import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Save, Plus, X } from 'lucide-react'
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
      toast.success('Parametres de visite enregistres')
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  })

  function toggleDay(day: number) {
    setWorkDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort())
  }

  function addSlot() {
    if (newSlot && !slots.includes(newSlot)) {
      setSlots(prev => [...prev, newSlot].sort())
      setNewSlot('')
    }
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
        <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Creneaux de visite disponibles</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {slots.map(slot => (
            <div key={slot} className="flex items-center gap-1 rounded-lg border border-immo-accent-green/30 bg-immo-accent-green/5 px-3 py-1.5">
              <span className="text-xs font-medium text-immo-accent-green">{slot}</span>
              <button onClick={() => setSlots(prev => prev.filter(s => s !== slot))} className="text-immo-text-muted hover:text-immo-status-red">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            type="time"
            value={newSlot}
            onChange={e => setNewSlot(e.target.value)}
            className="w-32 text-sm"
          />
          <Button size="sm" onClick={addSlot} disabled={!newSlot} className="border border-immo-border-default bg-transparent text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover">
            <Plus className="mr-1 h-3 w-3" /> Ajouter
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-immo-text-muted">
          Ces creneaux seront proposes aux agents dans le script d'appel et le calendrier de visite.
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
        <Save className="mr-1.5 h-4 w-4" /> {save.isPending ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </div>
  )
}
