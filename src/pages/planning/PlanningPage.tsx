import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock,
  CheckCircle, AlertCircle, Bot,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard, FilterDropdown, PageSkeleton, EmptyState,
  SidePanel,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import type { PipelineStage, VisitStatus } from '@/types'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths,
  addWeeks, addDays, getHours,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { WEEKDAYS_FR } from '@/lib/format'
import { PlanVisitModal } from '../pipeline/components/modals/PlanVisitModal'
import { ManageVisitModal } from '../pipeline/components/modals/ManageVisitModal'
import { usePlanningEvents, type PlanEvent, type PlanEventType } from './lib/planningEvents'
import { EVENT_VISUALS, urgencyRing } from './lib/eventVisuals'

type ViewMode = 'month' | 'week' | 'day'

// Re-renders every minute so the "Maintenant" line tracks the clock
// without forcing a full-page refresh.
function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

const HOUR_PX = 48  // matches min-h-[48px] on each hourly row
const HOUR_START = 8
const HOUR_END = 19

export function PlanningPage() {
  const navigate = useNavigate()
  const { tenantId, session } = useAuthStore()
  const userId = session?.user?.id
  const { isAgent } = usePermissions()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [agentFilter, setAgentFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [showTasks, setShowTasks] = useState(false)

  // Source toggles — drive the chip filter row.
  const [include, setInclude] = useState({
    visits: true,
    tasks: true,
    payments: true,
    reservations: true,
  })

  const [planDate, setPlanDate] = useState<string | null>(null)
  const [manageVisit, setManageVisit] = useState<PlanEvent | null>(null)

  const rangeStart = format(startOfWeek(startOfMonth(currentDate), { locale: fr }), 'yyyy-MM-dd')
  const rangeEnd = format(endOfWeek(endOfMonth(currentDate), { locale: fr }), 'yyyy-MM-dd')

  const { data: events = [], isLoading } = usePlanningEvents({
    tenantId: tenantId ?? '',
    rangeStart,
    rangeEnd,
    agentId: isAgent ? userId : (agentFilter === 'all' ? null : agentFilter),
    projectFilter: projectFilter === 'all' ? null : projectFilter,
    include,
  })

  const { data: agents = [] } = useQuery({
    queryKey: ['planning-agents', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name').eq('tenant_id', tenantId!).in('role', ['agent', 'admin']).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>
    },
    enabled: !!tenantId && !isAgent,
  })

  const { data: projectsList = [] } = useQuery({
    queryKey: ['planning-projects', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('tenant_id', tenantId!).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
    enabled: !!tenantId,
  })

  const { data: aiTasks = [] } = useQuery({
    queryKey: ['ai-tasks', tenantId],
    queryFn: async () => {
      let q = supabase.from('tasks').select('*, clients(full_name)').eq('tenant_id', tenantId!).is('deleted_at', null).eq('type', 'ai_generated').eq('status', 'pending').order('created_at', { ascending: false }).limit(20)
      if (isAgent && userId) q = q.eq('agent_id', userId)
      const { data, error } = await q
      if (error) return []
      return data as unknown as Array<Record<string, unknown>>
    },
    enabled: !!tenantId,
  })

  const today = new Date()
  const todayCount = events.filter(e => isSameDay(new Date(e.at), today)).length
  const upcoming = events.filter(e => new Date(e.at) > today).length
  const visitsCount = events.filter(e => e.type === 'visit').length
  const dueCount = events.filter(e => e.type === 'payment_due' || e.type === 'reservation_expires').length

  const agentOptions = [{ value: 'all', label: 'Tous les agents' }, ...agents.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]
  const projectOptions = [{ value: 'all', label: 'Tous les projets' }, ...projectsList.map(p => ({ value: p.id, label: p.name }))]

  function navigateDate(dir: number) {
    if (viewMode === 'month') setCurrentDate(d => addMonths(d, dir))
    else if (viewMode === 'week') setCurrentDate(d => addWeeks(d, dir))
    else setCurrentDate(d => addDays(d, dir))
  }

  // Click handler — visits open the manage modal in-place; everything
  // else routes to the surface where the agent actually does the work.
  function onEventClick(e: PlanEvent) {
    if (e.type === 'visit') {
      setManageVisit(e)
      return
    }
    if (e.type.startsWith('task_')) {
      navigate('/tasks')
      return
    }
    if (e.type === 'payment_due' && e.client_id) {
      navigate(`/dossiers?clientId=${e.client_id}`)
      return
    }
    if (e.type === 'reservation_expires' && e.client_id) {
      navigate(`/pipeline?clientId=${e.client_id}`)
    }
  }

  function getVisitClient(e: PlanEvent) {
    return {
      id: e.client_id ?? '',
      full_name: e.client_name ?? '-',
      phone: e.client_phone ?? '',
      pipeline_stage: ((e.meta?.pipeline_stage as PipelineStage) ?? 'accueil'),
      tenant_id: ((e.meta?.tenant_id as string) ?? tenantId!),
      nin_cin: null,
    }
  }

  if (isLoading) return <PageSkeleton kpiCount={4} />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <p className="text-xs text-immo-text-muted">
          Vue unifiée — visites, tâches, échéances paiement et expirations réservation
        </p>
        <Button onClick={() => setShowTasks(true)} variant="ghost" className="border border-immo-border-default text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover">
          <Bot className="mr-1.5 h-3.5 w-3.5 text-purple-400" /> Tâches AI ({aiTasks.length})
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Aujourd'hui" value={todayCount} accent="green" icon={<CalendarDays className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="À venir" value={upcoming} accent="blue" icon={<Clock className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Visites" value={visitsCount} accent="green" icon={<CheckCircle className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="Échéances" value={dueCount} accent="orange" icon={<AlertCircle className="h-4 w-4 text-immo-status-orange" />} />
      </div>

      {/* Source chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-immo-text-muted">Sources :</span>
        {([
          ['visits',       'Visites',       'visit'              as PlanEventType],
          ['tasks',        'Tâches',        'task_call'          as PlanEventType],
          ['payments',     'Paiements',     'payment_due'        as PlanEventType],
          ['reservations', 'Réservations',  'reservation_expires' as PlanEventType],
        ] as const).map(([key, label, sample]) => {
          const v = EVENT_VISUALS[sample]
          const on = include[key]
          return (
            <button
              key={key}
              onClick={() => setInclude(prev => ({ ...prev, [key]: !prev[key] }))}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                on
                  ? `${v.bg} ${v.text} border-current`
                  : 'border-immo-border-default text-immo-text-muted hover:bg-immo-bg-card-hover'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: on ? v.hex : '#41506E' }} />
              {label}
            </button>
          )
        })}
      </div>

      {/* Calendar nav + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigateDate(-1)} className="h-8 w-8 p-0 text-immo-text-muted hover:text-immo-text-primary">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())} className="text-xs text-immo-text-secondary hover:text-immo-text-primary">
            Aujourd'hui
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigateDate(1)} className="h-8 w-8 p-0 text-immo-text-muted hover:text-immo-text-primary">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold capitalize text-immo-text-primary">
            {format(currentDate, viewMode === 'day' ? 'EEEE d MMMM yyyy' : 'MMMM yyyy', { locale: fr })}
          </span>
        </div>

        <div className="flex gap-1 rounded-lg border border-immo-border-default p-0.5">
          {(['month', 'week', 'day'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${viewMode === m ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'}`}
            >
              {m === 'month' ? 'Mois' : m === 'week' ? 'Semaine' : 'Jour'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          {!isAgent && <FilterDropdown label="Agent" options={agentOptions} value={agentFilter} onChange={setAgentFilter} />}
          <FilterDropdown label="Projet" options={projectOptions} value={projectFilter} onChange={setProjectFilter} />
        </div>
      </div>

      {/* Views */}
      {viewMode === 'month' && (
        <MonthView
          currentDate={currentDate}
          events={events}
          onDayClick={(d) => setPlanDate(format(d, 'yyyy-MM-dd'))}
          onEventClick={onEventClick}
        />
      )}
      {viewMode === 'week' && (
        <WeekView currentDate={currentDate} events={events} onEventClick={onEventClick} />
      )}
      {viewMode === 'day' && (
        <DayView currentDate={currentDate} events={events} onEventClick={onEventClick} />
      )}

      {/* AI Tasks side panel */}
      <SidePanel isOpen={showTasks} onClose={() => setShowTasks(false)} title="Tâches AI" subtitle="Suggestions générées par l'IA">
        {aiTasks.length === 0 ? (
          <EmptyState icon={<Bot className="h-10 w-10" />} title="Aucune tâche AI" description="Les suggestions apparaîtront ici" />
        ) : (
          <div className="space-y-2">
            {aiTasks.map((t) => (
              <div key={t.id as string} className="rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
                <p className="text-sm text-immo-text-primary">{t.title as string}</p>
                <p className="mt-1 text-[11px] text-immo-text-muted">
                  {(t.clients as { full_name: string })?.full_name ?? '-'}
                  {typeof t.due_at === 'string' && ` · ${format(new Date(t.due_at), 'dd/MM/yyyy')}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </SidePanel>

      {planDate && (
        <PlanVisitModal
          isOpen
          onClose={() => setPlanDate(null)}
          client={null}
          prefillDate={planDate}
        />
      )}

      {manageVisit && (
        <ManageVisitModal
          isOpen
          onClose={() => setManageVisit(null)}
          visit={{
            id: (manageVisit.meta?.raw_id as string) ?? manageVisit.id.replace(/^visit_/, ''),
            scheduled_at: manageVisit.at,
            visit_type: (manageVisit.meta?.visit_type as string) ?? '',
            status: (manageVisit.meta?.status as VisitStatus) ?? 'planned',
            notes: (manageVisit.meta?.notes as string | null) ?? null,
          }}
          client={getVisitClient(manageVisit)}
        />
      )}
    </div>
  )
}

/* ═══ Month View ═══ */

function MonthView({ currentDate, events, onDayClick, onEventClick }: {
  currentDate: Date
  events: PlanEvent[]
  onDayClick: (d: Date) => void
  onEventClick: (e: PlanEvent) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { locale: fr })
  const calEnd = endOfWeek(monthEnd, { locale: fr })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })
  const WEEKDAYS = WEEKDAYS_FR

  return (
    <div className="overflow-hidden rounded-xl border border-immo-border-default">
      <div className="grid grid-cols-7 bg-immo-bg-card-hover">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold text-immo-text-muted">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = isSameMonth(day, currentDate)
          const isCurrent = isToday(day)
          const dayEvents = events.filter(e => isSameDay(new Date(e.at), day))

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`min-h-[100px] cursor-pointer border-b border-r border-immo-border-default p-1.5 transition-colors hover:bg-immo-bg-card-hover ${
                isCurrent
                  ? 'bg-immo-accent-green/5 ring-1 ring-inset ring-immo-accent-green/30'
                  : inMonth
                    ? 'bg-immo-bg-card'
                    : 'bg-immo-bg-primary/30'
              }`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isCurrent
                      ? 'bg-immo-accent-green font-bold text-immo-bg-primary'
                      : inMonth
                        ? 'text-immo-text-primary'
                        : 'text-immo-text-muted/50'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              </div>

              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => {
                  const v = EVENT_VISUALS[ev.type]
                  const Icon = v.icon
                  const ring = urgencyRing(ev.type, ev.at, ev.meta?.status as string | undefined)
                  return (
                    <button
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                      className={`flex w-full items-center gap-1 rounded border-l-2 px-1 py-0.5 text-left text-[10px] transition-colors hover:brightness-125 ${v.bg} ${v.border} ${ring}`}
                    >
                      <Icon className={`h-2.5 w-2.5 shrink-0 ${v.text}`} />
                      <span className="text-immo-text-muted">{format(new Date(ev.at), 'HH:mm')}</span>
                      <span className="truncate text-immo-text-primary">
                        {ev.client_name?.split(' ')[0] ?? ev.title}
                      </span>
                    </button>
                  )
                })}
                {dayEvents.length > 3 && (
                  <span className="block text-center text-[9px] text-immo-text-muted">+{dayEvents.length - 3}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══ Week View ═══ */

function WeekView({ currentDate, events, onEventClick }: {
  currentDate: Date
  events: PlanEvent[]
  onEventClick: (e: PlanEvent) => void
}) {
  const weekStart = startOfWeek(currentDate, { locale: fr })
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) })
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => i + HOUR_START)
  const now = useNow()

  // The "now" line only renders when today is within this week AND
  // the clock is inside the 8-19 visible band.
  const todayIdx = weekDays.findIndex(d => isSameDay(d, now))
  const nowHour = now.getHours() + now.getMinutes() / 60
  const showNowLine = todayIdx !== -1 && nowHour >= HOUR_START && nowHour <= HOUR_END + 1
  const nowTopPx = showNowLine ? (nowHour - HOUR_START) * HOUR_PX : 0

  return (
    <div className="overflow-hidden rounded-xl border border-immo-border-default">
      <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-immo-bg-card-hover">
        <div />
        {weekDays.map((d) => (
          <div key={d.toISOString()} className={`px-2 py-2 text-center ${isToday(d) ? 'bg-immo-accent-green/5' : ''}`}>
            <span className="text-[10px] text-immo-text-muted">{format(d, 'EEE', { locale: fr })}</span>
            <span className={`ml-1 text-xs font-semibold ${isToday(d) ? 'text-immo-accent-green' : 'text-immo-text-primary'}`}>
              {format(d, 'd')}
            </span>
          </div>
        ))}
      </div>
      <div className="relative max-h-[500px] overflow-y-auto">
        {showNowLine && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
            style={{ top: `${nowTopPx}px` }}
          >
            <span className="ml-[60px] -translate-y-1/2 rounded-full bg-immo-status-red px-1.5 py-0.5 text-[9px] font-bold text-white">
              {format(now, 'HH:mm')}
            </span>
            <div className="h-px flex-1 bg-immo-status-red" />
          </div>
        )}
        {hours.map((hour) => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-immo-border-default">
            <div className="px-2 py-2 text-right text-[10px] text-immo-text-muted">{hour}:00</div>
            {weekDays.map((day) => {
              const cellEvents = events.filter(e => {
                const d = new Date(e.at)
                return isSameDay(d, day) && getHours(d) === hour
              })
              return (
                <div key={day.toISOString()} className={`min-h-[48px] border-l border-immo-border-default p-0.5 ${isToday(day) ? 'bg-immo-accent-green/5' : 'bg-immo-bg-card'}`}>
                  {cellEvents.map((ev) => {
                    const v = EVENT_VISUALS[ev.type]
                    const Icon = v.icon
                    const ring = urgencyRing(ev.type, ev.at, ev.meta?.status as string | undefined)
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onEventClick(ev)}
                        className={`mb-0.5 flex w-full items-center gap-1 rounded border-l-2 px-1 py-0.5 text-[10px] transition-colors hover:brightness-125 ${v.bg} ${v.border} ${ring}`}
                      >
                        <Icon className={`h-2.5 w-2.5 shrink-0 ${v.text}`} />
                        <span className="truncate text-immo-text-primary">
                          {ev.client_name?.split(' ')[0] ?? ev.title}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ Day View ═══ */

function DayView({ currentDate, events, onEventClick }: {
  currentDate: Date
  events: PlanEvent[]
  onEventClick: (e: PlanEvent) => void
}) {
  const now = useNow()
  const isCurrentDay = isSameDay(currentDate, now)
  const dayEvents = events
    .filter(e => isSameDay(new Date(e.at), currentDate))
    .sort((a, b) => a.at.localeCompare(b.at))

  if (dayEvents.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-10 w-10" />}
        title="Aucun événement"
        description={`Pas d'activité prévue le ${format(currentDate, 'EEEE d MMMM yyyy', { locale: fr })}`}
      />
    )
  }

  // Index of the first future event — the "Maintenant" separator
  // slips in just before it so past/future are visually split.
  const firstFutureIdx = isCurrentDay
    ? dayEvents.findIndex(e => new Date(e.at).getTime() > now.getTime())
    : -1

  return (
    <div className="space-y-2">
      {dayEvents.map((ev, idx) => {
        const showNowLine = isCurrentDay && idx === firstFutureIdx
        return (
          <div key={ev.id}>
            {showNowLine && (
              <div className="my-3 flex items-center gap-2">
                <span className="rounded-full bg-immo-status-red px-2 py-0.5 text-[10px] font-bold text-white">
                  Maintenant · {format(now, 'HH:mm')}
                </span>
                <div className="h-px flex-1 bg-immo-status-red/50" />
              </div>
            )}
            {(() => {
              const v = EVENT_VISUALS[ev.type]
              const Icon = v.icon
              const ring = urgencyRing(ev.type, ev.at, ev.meta?.status as string | undefined)
              return (
                <button
                  onClick={() => onEventClick(ev)}
                  className={`flex w-full items-center gap-4 rounded-xl border border-l-4 border-immo-border-default ${v.border} ${ring} bg-immo-bg-card p-4 text-left transition-colors hover:border-immo-border-glow/30`}
                >
                  <div className="w-[60px] shrink-0 text-center">
                    <p className="text-lg font-bold text-immo-text-primary">{format(new Date(ev.at), 'HH:mm')}</p>
                    <p className={`text-[10px] ${v.text}`}>{v.label}</p>
                  </div>

                  <div className="h-10 w-px bg-immo-border-default" />

                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${v.bg}`}>
                    <Icon className={`h-4 w-4 ${v.text}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-immo-text-primary">
                      {ev.title}{ev.client_name ? ` · ${ev.client_name}` : ''}
                    </p>
                    <p className="text-xs text-immo-text-muted">
                      {ev.client_phone ? `${ev.client_phone} · ` : ''}
                      {ev.agent_name ? `Agent : ${ev.agent_name}` : ''}
                    </p>
                  </div>
                </button>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
