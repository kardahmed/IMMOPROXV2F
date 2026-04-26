import { useState, useMemo, lazy, Suspense } from 'react'
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
  const navigate = useNavigate()
  const { clients: rawClients, isLoading: loadingClients, updateClientStage } = useClients()
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
  }, [clients, search, alertFilter, advFilters])

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
          // If note provided, add to history
          if (note) {
            supabase.from('history').insert({
              tenant_id: tenantId,
              client_id: pendingMove.clientId,
              agent_id: null,
              type: 'note',
              title: note,
              metadata: { from: pendingMove.fromStage, to: pendingMove.toStage },
            } as never)
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
      toast.success(`${ids.length} client(s) reassigne(s)`)
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
          <Kanban className="h-3.5 w-3.5" /> Pipeline
        </button>
        <button onClick={() => setPipelineTab('analytics')}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${pipelineTab === 'analytics' ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
          <BarChart3 className="h-3.5 w-3.5" /> Repartition par etape
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
            Filtre actif : {alertFilter.length} client(s)
          </span>
          <button
            onClick={clearAlertFilter}
            className="text-xs text-immo-status-orange underline hover:no-underline"
          >
            Effacer
          </button>
        </div>
      )}

      {/* 2. KPIs */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
          <KPICard
            label="Clients"
            value={stats.kpis.totalClients}
            accent="blue"
            icon={<Users className="h-4 w-4 text-immo-accent-blue" />}
          />
          <KPICard
            label="Visites en attente"
            value={stats.kpis.pendingVisits}
            accent="orange"
            icon={<Calendar className="h-4 w-4 text-immo-status-orange" />}
          />
          <KPICard
            label="En négociation"
            value={stats.kpis.inNegotiation}
            accent="blue"
            icon={<Handshake className="h-4 w-4 text-immo-accent-blue" />}
          />
          <KPICard
            label="Convertis"
            value={stats.kpis.converted}
            accent="green"
            icon={<CheckCircle className="h-4 w-4 text-immo-accent-green" />}
          />
          <KPICard
            label="Potentiel total"
            value={formatPriceCompact(stats.kpis.totalPotential)}
            accent="blue"
            icon={<DollarSign className="h-4 w-4 text-immo-accent-blue" />}
          />
          <KPICard
            label="En négo DA"
            value={formatPriceCompact(stats.kpis.negotiationValue)}
            accent="orange"
            icon={<TrendingUp className="h-4 w-4 text-immo-status-orange" />}
          />
          <KPICard
            label="Valeur convertie"
            value={formatPriceCompact(stats.kpis.convertedValue)}
            accent="green"
            icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />}
          />
          <KPICard
            label="Budget moyen"
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
          placeholder="Nom, téléphone..."
          value={search}
          onChange={setSearch}
          className="w-full sm:w-[240px]"
        />
        <FilterDropdown
          label="Projet"
          options={[{ value: 'all', label: 'Tous les projets' }]}
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
            { header: 'Priorite', value: c => c.is_priority ? 'Oui' : 'Non' },
            { header: 'Cree le', value: c => c.created_at?.split('T')[0] },
          ])}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export
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
            {compact ? 'Compact' : 'Detail'}
          </button>
        )}

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-immo-border-default">
          {([
            { mode: 'kanban' as ViewMode, icon: Kanban, label: 'Kanban' },
            { mode: 'cards' as ViewMode, icon: LayoutGrid, label: 'Cartes' },
            { mode: 'table' as ViewMode, icon: List, label: 'Tableau' },
          ]).map(({ mode, icon: Icon }) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
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
            <Plus className="mr-1.5 h-4 w-4" /> Client
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
              {selectedIds.size} client(s)
            </span>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-immo-text-muted hover:text-immo-text-primary">
              Deselectionner tout
            </button>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={reassignAgent}
              onChange={(e) => setReassignAgent(e.target.value)}
              className="h-9 rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary"
            >
              <option value="">Reassigner a...</option>
              {agentMap && Array.from(agentMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <Button
              onClick={handleBatchReassign}
              disabled={!reassignAgent}
              className="bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90 disabled:opacity-50"
            >
              Reassigner
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
