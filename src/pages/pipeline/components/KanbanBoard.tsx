import { useState, useRef, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage, Client } from '@/types'
import { PIPELINE_ORDER } from '@/lib/constants'
import { KanbanCard } from './KanbanCard'
import type { KanbanCardClient } from './KanbanCard'

interface KanbanBoardProps {
  clientsByStage: Record<PipelineStage, Client[]>
  onMoveClient: (clientId: string, newStage: PipelineStage) => void
  onViewClient: (clientId: string) => void
  onAddClient: (stage: PipelineStage) => void
  compact?: boolean
  selectedIds?: Set<string>
  onSelectClient?: (id: string) => void
}

export function KanbanBoard({
  clientsByStage,
  onMoveClient,
  onAddClient,
  compact = false,
  selectedIds,
  onSelectClient,
}: KanbanBoardProps) {
  const { tenantId } = useAuthStore()
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<PipelineStage | null>(null)
  const dragRef = useRef<string | null>(null)

  // Fetch all client IDs we need history for
  const allClientIds = useMemo(() => {
    const ids: string[] = []
    for (const stage of PIPELINE_ORDER) {
      for (const c of clientsByStage[stage] ?? []) {
        ids.push(c.id)
      }
    }
    return ids
  }, [clientsByStage])

  // Fetch last stage_change per client + settings
  const { data: stageChangeDates } = useQuery({
    queryKey: ['stage-change-dates', tenantId, allClientIds.length],
    queryFn: async () => {
      if (allClientIds.length === 0) return { dates: new Map<string, string>(), urgentDays: 7 }

      const [historyRes, settingsRes] = await Promise.all([
        supabase
          .from('history')
          .select('client_id, created_at')
          .eq('type', 'stage_change')
          .in('client_id', allClientIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('tenant_settings')
          .select('urgent_alert_days')
          .eq('tenant_id', tenantId!)
          .single(),
      ])

      // Map: clientId → most recent stage_change date
      const dates = new Map<string, string>()
      for (const row of (historyRes.data ?? []) as Array<{ client_id: string; created_at: string }>) {
        if (!dates.has(row.client_id)) {
          dates.set(row.client_id, row.created_at)
        }
      }

      return {
        dates,
        urgentDays: settingsRes.data?.urgent_alert_days ?? 7,
      }
    },
    enabled: !!tenantId && allClientIds.length > 0,
    staleTime: 60_000,
  })

  const urgentDays = stageChangeDates?.urgentDays ?? 7
  const changeDates = stageChangeDates?.dates ?? new Map<string, string>()

  // Fetch agent & project names for display
  const { data: agentMap } = useQuery({
    queryKey: ['agent-names', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('tenant_id', tenantId!)
      const m = new Map<string, string>()
      for (const u of (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>) {
        m.set(u.id, `${u.first_name} ${u.last_name}`)
      }
      return m
    },
    enabled: !!tenantId,
    staleTime: 300_000,
  })

  const { data: projectMap } = useQuery({
    queryKey: ['project-names', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('tenant_id', tenantId!)
      const m = new Map<string, string>()
      for (const p of (data ?? []) as Array<{ id: string; name: string }>) {
        m.set(p.id, p.name)
      }
      return m
    },
    enabled: !!tenantId,
    staleTime: 300_000,
  })

  // Build enriched card data
  function toCardClient(c: Client): KanbanCardClient {
    const stageChangeDate = changeDates.get(c.id) ?? c.created_at
    const daysInStage = Math.floor((Date.now() - new Date(stageChangeDate).getTime()) / 86400000)

    // Find first project name from interested_projects
    let projectName: string | null = null
    if (c.interested_projects && c.interested_projects.length > 0 && projectMap) {
      projectName = projectMap.get(c.interested_projects[0]) ?? null
    }

    return {
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      source: c.source,
      agent_name: c.agent_id && agentMap ? agentMap.get(c.agent_id) ?? null : null,
      project_name: projectName,
      created_at: c.created_at,
      days_in_stage: daysInStage,
      is_urgent: daysInStage > urgentDays && !['vente', 'perdue'].includes(c.pipeline_stage),
    }
  }

  // Drag handlers
  function handleDragStart(clientId: string) {
    dragRef.current = clientId
    setDragging(clientId)
  }

  function handleDragEnd() {
    dragRef.current = null
    setDragging(null)
    setDragOver(null)
  }

  function handleDragOver(e: React.DragEvent, stage: PipelineStage) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(stage)
  }

  function handleDrop(stage: PipelineStage) {
    if (dragRef.current) {
      onMoveClient(dragRef.current, stage)
    }
    handleDragEnd()
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {PIPELINE_ORDER.map((stage) => {
        const meta = PIPELINE_STAGES[stage]
        const clients = clientsByStage[stage] ?? []
        const isOver = dragOver === stage

        return (
          <div
            key={stage}
            className={`flex w-[280px] shrink-0 flex-col rounded-xl border transition-colors ${
              isOver
                ? 'border-immo-accent-green/50 bg-immo-accent-green/5'
                : 'border-immo-border-default bg-immo-bg-primary/50'
            }`}
            onDragOver={(e) => handleDragOver(e, stage)}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(stage)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between border-b border-immo-border-default px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                <span className="text-xs font-semibold text-immo-text-primary">{meta.label}</span>
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-immo-bg-card-hover px-1.5 text-[10px] font-bold text-immo-text-muted">
                  {clients.length}
                </span>
              </div>
              <button
                onClick={() => onAddClient(stage)}
                className="rounded-md p-1 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-accent-green"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: '60vh' }}>
              {clients.length === 0 ? (
                <div className="py-8 text-center text-[11px] text-immo-text-muted">
                  Aucun client
                </div>
              ) : (
                clients.map((client) => (
                  <KanbanCard
                    key={client.id}
                    client={toCardClient(client)}
                    urgentDays={urgentDays}
                    compact={compact}
                    selected={selectedIds?.has(client.id)}
                    onSelect={onSelectClient}
                    isDragging={dragging === client.id}
                    onDragStart={() => handleDragStart(client.id)}
                    onDragEnd={handleDragEnd}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
