import { useState, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users,
  Calendar,
  Handshake,
  CheckCircle,
  DollarSign,
  TrendingUp,
  Wallet,
  Plus,
  Download,
  Kanban,
  LayoutGrid,
  List,
  BarChart3,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useClients } from '@/hooks/useClients'
import { useAutoTasks } from '@/hooks/useAutoTasks'
import { exportToCsv } from '@/lib/exportCsv'
import { appendClientNote } from '@/lib/clientNotes'
import { isValidTransition, explainRefusedTransition } from '@/lib/pipelineTransitions'
import { usePipelineStats } from '@/hooks/usePipelineStats'
import type { PipelineAlert } from '@/hooks/usePipelineStats'
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard,
  SearchInput,
  FilterDropdown,
  PageSkeleton,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { formatPriceCompact } from '@/lib/constants'
import { PIPELINE_ORDER } from '@/lib/constants'
import type { PipelineStage, Client } from '@/types'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { handleSupabaseError } from '@/lib/errors'
import toast from 'react-hot-toast'
import { AlertBar } from './components/AlertBar'
import { PrioritySlider } from './components/PrioritySlider'
// StageProgress moved to Analytics tab
import { KanbanBoard } from './components/KanbanBoard'
import { CardsView } from './components/CardsView'
import { TableView } from './components/TableView'
const ClientFormModal = lazy(() => import('./components/ClientFormModal').then(m => ({ default: m.ClientFormModal })))
const SmartStageDialog = lazy(() => import('./components/SmartStageDialog').then(m => ({ default: m.SmartStageDialog })))
import { ClientSidePanel } from './components/ClientSidePanel'
import { AdvancedFilters, EMPTY_FILTERS } from './components/AdvancedFilters'
import type { AdvancedFilterValues } from './components/AdvancedFilters'

import { PipelineAnalytics } from './components/PipelineAnalytics'

type ViewMode = 'kanban' | 'cards' | 'table' | 'analytics'

export function PipelinePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // The Kanban renders every active client across 9 stage columns —
  // the default page size of 50 was capping the entire pipeline at
  // 50 rows total. Pass 'all' so each column gets its true count.
  const { clients: rawClients, isLoading: loadingClients, updateClientStage } = useClients({ pageSize: 'all' })
  const { generateForStage } = useAutoTasks()
  const { data: stats, isLoading: loadingStats } = usePipelineStats()
  const { canManageProjects } = usePermissions()

  const clients = rawClients as unknown as Client[]
  const tenantId = useAuthStore((s) => s.tenantId)

  // Shared lookup maps for Cards/Table views
  const { data: agentMap } = useQuery({
    queryKey: ['agent-names', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name').eq('tenant_id', tenantId!)
      const m = new Map<string, string>()
      for (const u of (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>) m.set(u.id, `${u.first_name} ${u.last_name}`)
      return m
    },
    enabled: !!tenantId,
    staleTime: 300_000,
  })

  const { data: projectMap } = useQuery({
    queryKey: ['project-names', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('tenant_id', tenantId!)
      const m = new Map<string, string>()
      for (const p of (data ?? []) as Array<{ id: string; name: string }>) m.set(p.id, p.name)
      return m
    },
    enabled: !!tenantId,
    staleTime: 300_000,
  })

  const { data: daysInStageMap } = useQuery({
    queryKey: ['stage-dates', tenantId, clients.length],
    queryFn: async () => {
      const ids = clients.map(c => c.id)
      if (ids.length === 0) return new Map<string, number>()
      const { data } = await supabase.from('history').select('client_id, created_at').eq('type', 'stage_change').in('client_id', ids).order('created_at', { ascending: false })
      const latest = new Map<string, string>()
      for (const r of (data ?? []) as Array<{ client_id: string; created_at: string }>) {
        if (!latest.has(r.client_id)) latest.set(r.client_id, r.created_at)
      }
      const m = new Map<string, number>()
      for (const c of clients) {
        const ref = latest.get(c.id) ?? c.created_at
        m.set(c.id, Math.floor((Date.now() - new Date(ref ?? 0).getTime()) / 86400000))
      }
      return m
    },
    enabled: !!tenantId && clients.length > 0,
    staleTime: 60_000,
  })

  const urgentDays = 7 // fallback, pipeline stats provides the real value

  const [pipelineTab, setPipelineTab] = useState<'pipeline' | 'analytics'>('pipeline')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [view, setView] = useState<ViewMode>('kanban')
  const [compact, setCompact] = useState(() => localStorage.getItem('pipeline-compact') === 'true')
  const [alertFilter, setAlertFilter] = useState<string[] | null>(null)
  const [showClientForm, setShowClientForm] = useState(false)
  const [sidePanelClientId, setSidePanelClientId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reassignAgent, setReassignAgent] = useState('')
  const [advFilters, setAdvFilters] = useState<AdvancedFilterValues>(EMPTY_FILTERS)
  const [pendingMove, setPendingMove] = useState<{ clientId: string; clientName: string; fromStage: PipelineStage; toStage: PipelineStage } | null>(null)

  // Filter clients
  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (alertFilter && !alertFilter.includes(c.id)) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.full_name.toLowerCase().includes(q) && !c.phone.toLowerCase().includes(q)) return false
      }
      // Audit (HIGH): the project FilterDropdown was wired to setProjectFilter
      // but never read in the filter chain. clients.interested_projects is a
      // string[] of project ids — match if the selected project is in there.
      if (projectFilter !== 'all' && !(c.interested_projects ?? []).includes(projectFilter)) return false
      // Advanced filters
      if (advFilters.agentId && c.agent_id !== advFilters.agentId) return false
      if (advFilters.source && c.source !== advFilters.source) return false
      if (advFilters.interestLevel && c.interest_level !== advFilters.interestLevel) return false
      if (advFilters.isPriority === 'true' && !c.is_priority) return false
      if (advFilters.isPriority === 'false' && c.is_priority) return false
      if (advFilters.budgetMin && (c.confirmed_budget ?? 0) < Number(advFilters.budgetMin)) return false
      if (advFilters.budgetMax && (c.confirmed_budget ?? Infinity) > Number(advFilters.budgetMax)) return false
      return true
    })
  }, [clients, search, alertFilter, advFilters, projectFilter])

  // Group by stage
  const clientsByStage = useMemo(() => {
    const map: Record<PipelineStage, Client[]> = {} as Record<PipelineStage, Client[]>
    for (const stage of PIPELINE_ORDER) {
      map[stage] = []
    }
    for (const c of filtered) {
      if (map[c.pipeline_stage]) {
        map[c.pipeline_stage].push(c)
      }
    }
    return map
  }, [filtered])

  // Priority clients
  const priorityClients = useMemo(() => {
    return clients.filter(
      (c) => (c.is_priority || c.interest_level === 'high') && !['vente', 'perdue'].includes(c.pipeline_stage)
    ).slice(0, 15)
  }, [clients])

  function handleAlertClick(alert: PipelineAlert) {
    if (alert.clientIds) {
      setAlertFilter(alert.clientIds)
    } else {
      setAlertFilter(null)
    }
  }

  function clearAlertFilter() {
    setAlertFilter(null)
  }

  function handleMoveClient(clientId: string, newStage: PipelineStage) {
    const client = clients.find(c => c.id === clientId)
    if (!client || client.pipeline_stage === newStage) return

    // Reject illegal funnel transitions before opening the dialog.
    // Without this, dragging an `accueil` lead straight to `vente`
    // would skip qualification, visit, and negotiation — silently
    // corrupting funnel KPIs and skipping the touchpoint automations
    // that depend on stage_changed_at moving in order.
    if (!isValidTransition(client.pipeline_stage, newStage)) {
      toast.error(explainRefusedTransition(client.pipeline_stage, newStage))
      return
    }

    setPendingMove({
      clientId,
      clientName: client.full_name,
      fromStage: client.pipeline_stage,
      toStage: newStage,
    })
  }

  function confirmMoveClient(note?: string) {
    if (!pendingMove) return
    updateClientStage.mutate(
      { clientId: pendingMove.clientId, newStage: pendingMove.toStage },
      {
        onSuccess: () => {
          // Auto-generate tasks for new stage + cancel old
          generateForStage.mutate({ clientId: pendingMove.clientId, newStage: pendingMove.toStage, oldStage: pendingMove.fromStage })
          // If note provided, log into history AND prepend the same
          // text into clients.notes so the agent sees the stage-change
          // context in the Notes tab on the client detail page.
          if (note) {
            supabase.from('history').insert({
              tenant_id: tenantId,
              client_id: pendingMove.clientId,
              agent_id: null,
              type: 'note',
              title: note,
              metadata: { from: pendingMove.fromStage, to: pendingMove.toStage },
            } as never)
            appendClientNote(
              pendingMove.clientId,
              `🔀 Étape: ${pendingMove.fromStage} → ${pendingMove.toStage}`,
              note,
            )
          }
          setPendingMove(null)
        },
      },
    )
  }

  function handleViewClient(clientId: string) {
    setSidePanelClientId(clientId)
  }

  function handlePriorityAction(clientId: string, action: string) {
    if (action === 'view') {
      navigate(`/pipeline/clients/${clientId}`)
    }
  }

  function toggleSelect(clientId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  async function handleBatchReassign() {
    if (!reassignAgent || selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from('clients')
      .update({ agent_id: reassignAgent } as never)
      .in('id', ids)
    if (error) {
      handleSupabaseError(error)
    } else {
      toast.success(t('pipeline_page.reassign_success', { count: ids.length }))
      setSelectedIds(new Set())
      setReassignAgent('')
    }
  }

  const isLoading = loadingClients || loadingStats

  if (isLoading) {
    return <PageSkeleton kpiCount={5} hasTable />
  }

  return (
    <div className="space-y-5">
      {/* Tabs: Pipeline | Analytique */}
      <div className="flex gap-1 border-b border-immo-border-default">
        <button onClick={() => setPipelineTab('pipeline')}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${pipelineTab === 'pipeline' ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
          <Kanban className="h-3.5 w-3.5" /> {t('pipeline_page.tab_pipeline')}
        </button>
        <button onClick={() => setPipelineTab('analytics')}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${pipelineTab === 'analytics' ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
          <BarChart3 className="h-3.5 w-3.5" /> {t('pipeline_page.tab_analytics')}
        </button>
      </div>

      {pipelineTab === 'analytics' ? (
        <PipelineAnalytics />
      ) : (
      <>
      {/* 1. Alerts */}
      {stats?.alerts && stats.alerts.length > 0 && (
        <AlertBar alerts={stats.alerts} onAlertClick={handleAlertClick} />
      )}

      {/* Alert filter indicator */}
      {alertFilter && (
        <div className="flex items-center gap-2 rounded-lg border border-immo-status-orange/30 bg-immo-status-orange-bg px-3 py-2">
          <span className="text-xs text-immo-status-orange">
            {t('pipeline_page.filter_active', { count: alertFilter.length })}
          </span>
          <button
            onClick={clearAlertFilter}
            className="text-xs text-immo-status-orange underline hover:no-underline"
          >
            {t('pipeline_page.clear_filter')}
          </button>
        </div>
      )}

      {/* 2. KPIs */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
          <KPICard
            label={t('pipeline_page.kpi_clients')}
            value={stats.kpis.totalClients}
            accent="blue"
            icon={<Users className="h-4 w-4 text-immo-accent-blue" />}
          />
          <KPICard
            label={t('pipeline_page.kpi_pending_visits')}
            value={stats.kpis.pendingVisits}
            accent="orange"
            icon={<Calendar className="h-4 w-4 text-immo-status-orange" />}
          />
          <KPICard
            label={t('pipeline_page.kpi_in_negotiation')}
            value={stats.kpis.inNegotiation}
            accent="blue"
            icon={<Handshake className="h-4 w-4 text-immo-accent-blue" />}
          />
          <KPICard
            label={t('pipeline_page.kpi_converted')}
            value={stats.kpis.converted}
            accent="green"
            icon={<CheckCircle className="h-4 w-4 text-immo-accent-green" />}
          />
          <KPICard
            label={t('pipeline_page.kpi_total_potential')}
            value={formatPriceCompact(stats.kpis.totalPotential)}
            accent="blue"
            icon={<DollarSign className="h-4 w-4 text-immo-accent-blue" />}
          />
          <KPICard
            label={t('pipeline_page.kpi_negotiation_value')}
            value={formatPriceCompact(stats.kpis.negotiationValue)}
            accent="orange"
            icon={<TrendingUp className="h-4 w-4 text-immo-status-orange" />}
          />
          <KPICard
            label={t('pipeline_page.kpi_converted_value')}
            value={formatPriceCompact(stats.kpis.convertedValue)}
            accent="green"
            icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />}
          />
          <KPICard
            label={t('pipeline_page.kpi_avg_budget')}
            value={formatPriceCompact(stats.kpis.avgBudget)}
            accent="blue"
            icon={<Wallet className="h-4 w-4 text-immo-accent-blue" />}
          />
        </div>
      )}

      {/* 3. Priority clients slider */}
      <PrioritySlider clients={priorityClients} onAction={handlePriorityAction} />

      {/* Stage progress moved to Analytics tab */}

      {/* 5. Filters toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder={t('pipeline_page.search_placeholder')}
          value={search}
          onChange={setSearch}
          className="w-full sm:w-[240px]"
        />
        <FilterDropdown
          label={t('pipeline_page.project')}
          options={[
            { value: 'all', label: t('pipeline_page.all_projects') },
            ...Array.from((projectMap ?? new Map<string, string>()).entries()).map(([id, name]) => ({
              value: id,
              label: name,
            })),
          ]}
          value={projectFilter}
          onChange={setProjectFilter}
        />
        <AdvancedFilters filters={advFilters} onChange={setAdvFilters} onClear={() => setAdvFilters(EMPTY_FILTERS)} />
        <Button
          variant="ghost"
          size="sm"
          className="border border-immo-border-default text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover"
          onClick={() => exportToCsv('clients-pipeline', filtered, [
            { header: 'Nom', value: c => c.full_name },
            { header: 'Telephone', value: c => c.phone },
            { header: 'Email', value: c => c.email },
            { header: 'Etape', value: c => c.pipeline_stage },
            { header: 'Source', value: c => c.source },
            { header: 'Budget', value: c => c.confirmed_budget },
            { header: 'Interet', value: c => c.interest_level },
            { header: 'Priorite', value: c => c.is_priority ? t('pipeline_page.yes') : t('pipeline_page.no') },
            { header: 'Cree le', value: c => c.created_at?.split('T')[0] },
          ])}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> {t('pipeline_page.export')}
        </Button>

        {/* Compact toggle */}
        {view === 'kanban' && (
          <button
            onClick={() => { setCompact(!compact); localStorage.setItem('pipeline-compact', String(!compact)) }}
            className={`ml-2 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${
              compact
                ? 'border-immo-accent-green/30 bg-immo-accent-green/10 text-immo-accent-green'
                : 'border-immo-border-default text-immo-text-muted hover:text-immo-text-secondary'
            }`}
          >
            {compact ? t('pipeline_page.compact') : t('pipeline_page.detail')}
          </button>
        )}

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-immo-border-default">
          {([
            { mode: 'kanban' as ViewMode, icon: Kanban, labelKey: 'pipeline_page.view_kanban' },
            { mode: 'cards' as ViewMode, icon: LayoutGrid, labelKey: 'pipeline_page.view_cards' },
            { mode: 'table' as ViewMode, icon: List, labelKey: 'pipeline_page.view_table' },
          ]).map(({ mode, icon: Icon, labelKey }) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              title={t(labelKey)}
              className={`rounded-md p-2 ${
                view === mode
                  ? 'bg-immo-accent-green/10 text-immo-accent-green'
                  : 'text-immo-text-muted hover:text-immo-text-secondary'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {canManageProjects && (
          <Button onClick={() => setShowClientForm(true)} className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
            <Plus className="mr-1.5 h-4 w-4" /> {t('pipeline_page.btn_client')}
          </Button>
        )}
      </div>

      {/* 6. Views */}
      {view === 'kanban' && (
        <KanbanBoard
          clientsByStage={clientsByStage}
          onMoveClient={handleMoveClient}
          onViewClient={handleViewClient}
          onAddClient={() => setShowClientForm(true)}
          compact={compact}
          selectedIds={selectedIds}
          onSelectClient={toggleSelect}
        />
      )}

      {view === 'cards' && (
        <CardsView
          clients={filtered}
          daysInStageMap={daysInStageMap ?? new Map()}
          agentMap={agentMap ?? new Map()}
          projectMap={projectMap ?? new Map()}
          urgentDays={urgentDays}
        />
      )}

      {view === 'table' && (
        <TableView
          clients={filtered}
          daysInStageMap={daysInStageMap ?? new Map()}
          agentMap={agentMap ?? new Map()}
          projectMap={projectMap ?? new Map()}
          urgentDays={urgentDays}
          onChangeStage={(id, stage) => updateClientStage.mutate({ clientId: id, newStage: stage })}
        />
      )}

      </>
      )}

      {/* Batch reassign bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 md:left-[220px] right-0 z-30 flex items-center justify-between border-t border-immo-border-default bg-immo-bg-card px-3 md:px-6 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-immo-accent-green/10 px-3 py-1 text-sm font-semibold text-immo-accent-green">
              {t('pipeline_page.selected_count', { count: selectedIds.size })}
            </span>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-immo-text-muted hover:text-immo-text-primary">
              {t('pipeline_page.deselect_all')}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={reassignAgent}
              onChange={(e) => setReassignAgent(e.target.value)}
              className="h-9 rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary"
            >
              <option value="">{t('pipeline_page.reassign_to')}</option>
              {agentMap && Array.from(agentMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <Button
              onClick={handleBatchReassign}
              disabled={!reassignAgent}
              className="bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90 disabled:opacity-50"
            >
              {t('pipeline_page.reassign_action')}
            </Button>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        {showClientForm && <ClientFormModal isOpen={showClientForm} onClose={() => setShowClientForm(false)} />}
      </Suspense>

      {/* Stage change confirmation dialog */}
      {/* Client side panel */}
      <ClientSidePanel clientId={sidePanelClientId} onClose={() => setSidePanelClientId(null)} />

      {pendingMove && (
        <Suspense fallback={null}>
          <SmartStageDialog
            isOpen
            onClose={() => setPendingMove(null)}
            onConfirm={confirmMoveClient}
            clientId={pendingMove.clientId}
            clientName={pendingMove.clientName}
            fromStage={pendingMove.fromStage}
            toStage={pendingMove.toStage}
            loading={updateClientStage.isPending}
          />
        </Suspense>
      )}
    </div>
  )
}
