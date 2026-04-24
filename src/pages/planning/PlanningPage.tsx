import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock,
  CheckCircle, AlertCircle, Bot,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard, FilterDropdown, PageSkeleton, EmptyState,
  SidePanel, StatusBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { VISIT_STATUS_LABELS } from '@/types'
import type { VisitStatus, PipelineStage } from '@/types'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths,
  addWeeks, addDays, getHours,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { PlanVisitModal } from '../pipeline/components/modals/PlanVisitModal'
import { ManageVisitModal } from '../pipeline/components/modals/ManageVisitModal'

/* ═══ Types ═══ */

interface VisitRow {
  id: string
  client_id: string
  agent_id: string
  project_id: string | null
  scheduled_at: string
  visit_type: string
  status: VisitStatus
  notes: string | null
  client_name: string
  agent_name: string
  client_phone: string
  client_stage: PipelineStage
  tenant_id: string
}

type ViewMode = 'month' | 'week' | 'day'

/* ═══ Component ═══ */

export function PlanningPage() {
  const { tenantId, session } = useAuthStore()
  const userId = session?.user?.id
  const { isAgent } = usePermissions()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [agentFilter, setAgentFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showTasks, setShowTasks] = useState(false)

  // Visit modal states
  const [planDate, setPlanDate] = useState<string | null>(null)
  const [manageVisit, setManageVisit] = useState<VisitRow | null>(null)

  // Date range for query
  const rangeStart = format(startOfWeek(startOfMonth(currentDate), { locale: fr }), 'yyyy-MM-dd')
  const rangeEnd = format(endOfWeek(endOfMonth(currentDate), { locale: fr }), 'yyyy-MM-dd')

  // Fetch visits
  const { data: visits = [], isLoading } = useQuery({
    queryKey: ['planning-visits', tenantId, rangeStart, rangeEnd, agentFilter],
    queryFn: async () => {
      let q = supabase
        .from('visits')
        .select('id, client_id, agent_id, project_id, scheduled_at, visit_type, status, notes, clients(full_name, phone, pipeline_stage, tenant_id), users!visits_agent_id_fkey(first_name, last_name)')
        .eq('tenant_id', tenantId!)
        .is('deleted_at', null)
        .gte('scheduled_at', `${rangeStart}T00:00:00`)
        .lte('scheduled_at', `${rangeEnd}T23:59:59`)
        .order('scheduled_at')

      if (isAgent && userId) {
        q = q.eq('agent_id', userId)
      } else if (agentFilter !== 'all') {
        q = q.eq('agent_id', agentFilter)
      }
      if (projectFilter !== 'all') q = q.eq('project_id', projectFilter)
      if (statusFilter !== 'all') q = q.eq('status', statusFilter as VisitStatus)

      const { data, error } = await q
      if (error) { handleSupabaseError(error); throw error }

      return (data ?? []).map((v: Record<string, unknown>) => {
        const client = v.clients as { full_name: string; phone: string; pipeline_stage: PipelineStage; tenant_id: string } | null
        const agent = v.users as { first_name: string; last_name: string } | null
        return {
          id: v.id as string,
          client_id: v.client_id as string,
          agent_id: v.agent_id as string,
          project_id: v.project_id as string | null,
          scheduled_at: v.scheduled_at as string,
          visit_type: v.visit_type as string,
          status: v.status as VisitStatus,
          notes: v.notes as string | null,
          client_name: client?.full_name ?? '-',
          agent_name: agent ? `${agent.first_name} ${agent.last_name}` : '-',
          client_phone: client?.phone ?? '',
          client_stage: client?.pipeline_stage ?? 'accueil',
          tenant_id: client?.tenant_id ?? tenantId!,
        } satisfies VisitRow
      })
    },
    enabled: !!tenantId,
  })

  // Fetch agents for filter
  const { data: agents = [] } = useQuery({
    queryKey: ['planning-agents', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name').eq('tenant_id', tenantId!).in('role', ['agent', 'admin']).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>
    },
    enabled: !!tenantId && !isAgent,
  })

  // Fetch projects for filter
  const { data: projectsList = [] } = useQuery({
    queryKey: ['planning-projects', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('tenant_id', tenantId!).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
    enabled: !!tenantId,
  })

  // AI Tasks
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

  // KPIs
  const today = new Date()
  const todayVisits = visits.filter(v => isSameDay(new Date(v.scheduled_at), today)).length
  const upcoming = visits.filter(v => new Date(v.scheduled_at) > today && ['planned', 'confirmed'].includes(v.status)).length
  const confirmed = visits.filter(v => v.status === 'confirmed').length
  const planned = visits.filter(v => v.status === 'planned').length

  // Filter options
  const agentOptions = [{ value: 'all', label: 'Tous les agents' }, ...agents.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]
  const projectOptions = [{ value: 'all', label: 'Tous les projets' }, ...projectsList.map(p => ({ value: p.id, label: p.name }))]
  const statusOptions = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'planned', label: 'Planifiée' },
    { value: 'confirmed', label: 'Confirmée' },
    { value: 'completed', label: 'Terminée' },
    { value: 'cancelled', label: 'Annulée' },
  ]

  // Navigation
  function navigate(dir: number) {
    if (viewMode === 'month') setCurrentDate(d => addMonths(d, dir))
    else if (viewMode === 'week') setCurrentDate(d => addWeeks(d, dir))
    else setCurrentDate(d => addDays(d, dir))
  }

  // Build client info for modals
  function getClientInfo(v: VisitRow) {
    return { id: v.client_id, full_name: v.client_name, phone: v.client_phone, pipeline_stage: v.client_stage, tenant_id: v.tenant_id, nin_cin: null }
  }

  if (isLoading) return <PageSkeleton kpiCount={4} />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-immo-text-muted">Ce planning affiche uniquement les visites</p>
        </div>
        <Button onClick={() => setShowTasks(true)} variant="ghost" className="border border-immo-border-default text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover">
          <Bot className="mr-1.5 h-3.5 w-3.5 text-purple-400" /> Tâches AI ({aiTasks.length})
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Aujourd'hui" value={todayVisits} accent="green" icon={<CalendarDays className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="À venir" value={upcoming} accent="blue" icon={<Clock className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Confirmées" value={confirmed} accent="green" icon={<CheckCircle className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="En attente" value={planned} accent="orange" icon={<AlertCircle className="h-4 w-4 text-immo-status-orange" />} />
      </div>

      {/* Calendar nav + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8 w-8 p-0 text-immo-text-muted hover:text-immo-text-primary">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())} className="text-xs text-immo-text-secondary hover:text-immo-text-primary">
            Aujourd'hui
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(1)} className="h-8 w-8 p-0 text-immo-text-muted hover:text-immo-text-primary">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold capitalize text-immo-text-primary">
            {format(currentDate, viewMode === 'day' ? 'EEEE d MMMM yyyy' : 'MMMM yyyy', { locale: fr })}
          </span>
        </div>

        {/* View toggle */}
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
          <FilterDropdown label="Statut" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
        </div>
      </div>

      {/* Views */}
      {viewMode === 'month' && (
        <MonthView
          currentDate={currentDate}
          visits={visits}
          onDayClick={(d) => setPlanDate(format(d, 'yyyy-MM-dd'))}
          onVisitClick={setManageVisit}
        />
      )}
      {viewMode === 'week' && (
        <WeekView currentDate={currentDate} visits={visits} onVisitClick={setManageVisit} />
      )}
      {viewMode === 'day' && (
        <DayView currentDate={currentDate} visits={visits} onVisitClick={setManageVisit} />
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

      {/* Plan visit modal */}
      {planDate && (
        <PlanVisitModal
          isOpen
          onClose={() => setPlanDate(null)}
          client={null}
          prefillDate={planDate}
        />
      )}

      {/* Manage visit modal */}
      {manageVisit && (
        <ManageVisitModal
          isOpen
          onClose={() => setManageVisit(null)}
          visit={{ id: manageVisit.id, scheduled_at: manageVisit.scheduled_at, visit_type: manageVisit.visit_type, status: manageVisit.status, notes: manageVisit.notes }}
          client={getClientInfo(manageVisit)}
        />
      )}
    </div>
  )
}

/* ═══ Month View ═══ */

function MonthView({ currentDate, visits, onDayClick, onVisitClick }: {
  currentDate: Date; visits: VisitRow[]; onDayClick: (d: Date) => void; onVisitClick: (v: VisitRow) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { locale: fr })
  const calEnd = endOfWeek(monthEnd, { locale: fr })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  return (
    <div className="overflow-hidden rounded-xl border border-immo-border-default">
      {/* Header */}
      <div className="grid grid-cols-7 bg-immo-bg-card-hover">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold text-immo-text-muted">{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)
          const dayVisits = visits.filter(v => isSameDay(new Date(v.scheduled_at), day))

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`min-h-[100px] cursor-pointer border-b border-r border-immo-border-default p-1.5 transition-colors hover:bg-immo-bg-card-hover ${
                inMonth ? 'bg-immo-bg-card' : 'bg-immo-bg-primary/30'
              }`}
            >
              {/* Day number */}
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    today
                      ? 'bg-immo-accent-green font-bold text-immo-bg-primary'
                      : inMonth
                        ? 'text-immo-text-primary'
                        : 'text-immo-text-muted/50'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              </div>
              {/* Visit pills */}
              <div className="space-y-0.5">
                {dayVisits.slice(0, 3).map((v) => {
                  const st = VISIT_STATUS_LABELS[v.status]
                  return (
                    <button
                      key={v.id}
                      onClick={(e) => { e.stopPropagation(); onVisitClick(v) }}
                      className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-immo-accent-green/10"
                      style={{ borderLeft: `2px solid ${st?.color ?? '#7F96B7'}` }}
                    >
                      <span className="text-immo-text-muted">{format(new Date(v.scheduled_at), 'HH:mm')}</span>
                      <span className="truncate text-immo-text-primary">{v.client_name.split(' ')[0]}</span>
                    </button>
                  )
                })}
                {dayVisits.length > 3 && (
                  <span className="block text-center text-[9px] text-immo-text-muted">+{dayVisits.length - 3}</span>
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

function WeekView({ currentDate, visits, onVisitClick }: {
  currentDate: Date; visits: VisitRow[]; onVisitClick: (v: VisitRow) => void
}) {
  const weekStart = startOfWeek(currentDate, { locale: fr })
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) })
  const hours = Array.from({ length: 12 }, (_, i) => i + 8) // 8h-19h

  return (
    <div className="overflow-hidden rounded-xl border border-immo-border-default">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-immo-bg-card-hover">
        <div />
        {weekDays.map((d) => (
          <div key={d.toISOString()} className="px-2 py-2 text-center">
            <span className="text-[10px] text-immo-text-muted">{format(d, 'EEE', { locale: fr })}</span>
            <span className={`ml-1 text-xs font-semibold ${isToday(d) ? 'text-immo-accent-green' : 'text-immo-text-primary'}`}>
              {format(d, 'd')}
            </span>
          </div>
        ))}
      </div>
      {/* Grid */}
      <div className="max-h-[500px] overflow-y-auto">
        {hours.map((hour) => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-immo-border-default">
            <div className="px-2 py-2 text-right text-[10px] text-immo-text-muted">{hour}:00</div>
            {weekDays.map((day) => {
              const cellVisits = visits.filter(v => {
                const d = new Date(v.scheduled_at)
                return isSameDay(d, day) && getHours(d) === hour
              })
              return (
                <div key={day.toISOString()} className="min-h-[48px] border-l border-immo-border-default bg-immo-bg-card p-0.5">
                  {cellVisits.map((v) => {
                    const st = VISIT_STATUS_LABELS[v.status]
                    return (
                      <button
                        key={v.id}
                        onClick={() => onVisitClick(v)}
                        className="mb-0.5 flex w-full items-center gap-1 rounded px-1 py-0.5 text-[10px] transition-colors hover:bg-immo-accent-green/10"
                        style={{ borderLeft: `2px solid ${st?.color ?? '#7F96B7'}` }}
                      >
                        <span className="truncate text-immo-text-primary">{v.client_name.split(' ')[0]}</span>
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

function DayView({ currentDate, visits, onVisitClick }: {
  currentDate: Date; visits: VisitRow[]; onVisitClick: (v: VisitRow) => void
}) {
  const dayVisits = visits
    .filter(v => isSameDay(new Date(v.scheduled_at), currentDate))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  if (dayVisits.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-10 w-10" />}
        title="Aucune visite"
        description={`Pas de visite prévue le ${format(currentDate, 'EEEE d MMMM yyyy', { locale: fr })}`}
      />
    )
  }

  return (
    <div className="space-y-2">
      {dayVisits.map((v) => {
        const st = VISIT_STATUS_LABELS[v.status] ?? { label: v.status, color: '#7F96B7' }
        const typeLabel = v.visit_type === 'on_site' ? 'Sur site' : v.visit_type === 'office' ? 'Bureau' : 'Virtuel'
        return (
          <button
            key={v.id}
            onClick={() => onVisitClick(v)}
            className="flex w-full items-center gap-4 rounded-xl border border-immo-border-default bg-immo-bg-card p-4 text-left transition-colors hover:border-immo-border-glow/30"
          >
            {/* Time */}
            <div className="w-[60px] shrink-0 text-center">
              <p className="text-lg font-bold text-immo-text-primary">{format(new Date(v.scheduled_at), 'HH:mm')}</p>
              <p className="text-[10px] text-immo-text-muted">{typeLabel}</p>
            </div>

            <div className="h-10 w-px bg-immo-border-default" />

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-immo-text-primary">{v.client_name}</p>
              <p className="text-xs text-immo-text-muted">{v.client_phone} · Agent : {v.agent_name}</p>
              {v.notes && <p className="mt-1 text-[11px] text-immo-text-muted">{v.notes}</p>}
            </div>

            <StatusBadge
              label={st.label}
              type={st.color === '#00D4A0' ? 'green' : st.color === '#FF4949' ? 'red' : st.color === '#FF9A1E' ? 'orange' : st.color === '#3782FF' ? 'blue' : 'muted'}
            />
          </button>
        )
      })}
    </div>
  )
}
