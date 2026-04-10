import { useState, useMemo } from 'react'
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
  SlidersHorizontal,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useClients } from '@/hooks/useClients'
import { usePipelineStats } from '@/hooks/usePipelineStats'
import type { PipelineAlert } from '@/hooks/usePipelineStats'
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard,
  SearchInput,
  FilterDropdown,
  LoadingSpinner,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { formatPriceCompact } from '@/lib/constants'
import { PIPELINE_ORDER } from '@/lib/constants'
import type { PipelineStage, Client } from '@/types'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { AlertBar } from './components/AlertBar'
import { PrioritySlider } from './components/PrioritySlider'
import { StageProgress } from './components/StageProgress'
import { KanbanBoard } from './components/KanbanBoard'
import { CardsView } from './components/CardsView'
import { TableView } from './components/TableView'
import { ClientFormModal } from './components/ClientFormModal'
import { StageChangeDialog } from './components/StageChangeDialog'

type ViewMode = 'kanban' | 'cards' | 'table'

export function PipelinePage() {
  const navigate = useNavigate()
  const { clients: rawClients, isLoading: loadingClients, updateClientStage } = useClients()
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
        m.set(c.id, Math.floor((Date.now() - new Date(ref).getTime()) / 86400000))
      }
      return m
    },
    enabled: !!tenantId && clients.length > 0,
    staleTime: 60_000,
  })

  const urgentDays = 7 // fallback, pipeline stats provides the real value

  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [view, setView] = useState<ViewMode>('kanban')
  const [alertFilter, setAlertFilter] = useState<string[] | null>(null)
  const [showClientForm, setShowClientForm] = useState(false)
  const [pendingMove, setPendingMove] = useState<{ clientId: string; clientName: string; fromStage: PipelineStage; toStage: PipelineStage } | null>(null)

  // Filter clients
  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (alertFilter && !alertFilter.includes(c.id)) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.full_name.toLowerCase().includes(q) && !c.phone.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [clients, search, alertFilter])

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
    navigate(`/pipeline/clients/${clientId}`)
  }

  function handlePriorityAction(clientId: string, action: string) {
    if (action === 'view') {
      navigate(`/pipeline/clients/${clientId}`)
    }
  }

  const isLoading = loadingClients || loadingStats

  if (isLoading) {
    return <LoadingSpinner size="lg" className="h-96" />
  }

  return (
    <div className="space-y-5">
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

      {/* 4. Stage progress */}
      {stats && <StageProgress stats={stats.stageStats} />}

      {/* 5. Filters toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Nom, téléphone..."
          value={search}
          onChange={setSearch}
          className="w-[240px]"
        />
        <FilterDropdown
          label="Projet"
          options={[{ value: 'all', label: 'Tous les projets' }]}
          value={projectFilter}
          onChange={setProjectFilter}
        />
        <Button
          variant="ghost"
          size="sm"
          className="border border-immo-border-default text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover"
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Filtres avancés
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="border border-immo-border-default text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export
        </Button>

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
          onAddClient={() => {}}
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

      <ClientFormModal isOpen={showClientForm} onClose={() => setShowClientForm(false)} />

      {/* Stage change confirmation dialog */}
      {pendingMove && (
        <StageChangeDialog
          isOpen
          onClose={() => setPendingMove(null)}
          onConfirm={confirmMoveClient}
          clientName={pendingMove.clientName}
          fromStage={pendingMove.fromStage}
          toStage={pendingMove.toStage}
          loading={updateClientStage.isPending}
        />
      )}
    </div>
  )
}
