import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
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
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Fetch all client IDs we need history for
  const allClientIds = useMemo(() => {
    const ids: string[] = []
    for (const stage of PIPELINE_ORDER) {
      for (const c of clientsByStage[stage] ?? []) ids.push(c.id)
    }
    return ids
  }, [clientsByStage])

  // Fetch last stage_change per client + settings
  const { data: stageChangeDates } = useQuery({
    queryKey: ['stage-change-dates', tenantId],
    queryFn: async () => {
      if (allClientIds.length === 0) return { dates: new Map<string, string>(), urgentDays: 7 }

      const [historyRes, settingsRes] = await Promise.all([
        supabase.from('history').select('client_id, created_at').eq('type', 'stage_change').in('client_id', allClientIds).order('created_at', { ascending: false }),
        supabase.from('tenant_settings').select('urgent_alert_days').eq('tenant_id', tenantId!).maybeSingle(),
      ])

      const dates = new Map<string, string>()
      for (const row of (historyRes.data ?? []) as Array<{ client_id: string; created_at: string }>) {
        if (!dates.has(row.client_id)) dates.set(row.client_id, row.created_at)
      }

      return { dates, urgentDays: settingsRes.data?.urgent_alert_days ?? 7 }
    },
    enabled: !!tenantId && allClientIds.length > 0,
    staleTime: 60_000,
  })

  const urgentDays = stageChangeDates?.urgentDays ?? 7
  const changeDates = stageChangeDates?.dates ?? new Map<string, string>()

  // Fetch agent & project names
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

  function toCardClient(c: Client): KanbanCardClient {
    const stageChangeDate = changeDates.get(c.id) ?? c.created_at
    const daysInStage = Math.floor((Date.now() - new Date(stageChangeDate ?? 0).getTime()) / 86400000)
    let projectName: string | null = null
    if (c.interested_projects?.length && projectMap) projectName = projectMap.get(c.interested_projects[0]) ?? null

    return {
      id: c.id, full_name: c.full_name, phone: c.phone, source: c.source,
      agent_name: c.agent_id && agentMap ? agentMap.get(c.agent_id) ?? null : null,
      project_name: projectName, created_at: c.created_at, days_in_stage: daysInStage,
      is_urgent: daysInStage > urgentDays && !['vente', 'perdue'].includes(c.pipeline_stage),
      is_priority: c.is_priority,
    }
  }

  // Find the active client for the drag overlay
  const activeClient = useMemo(() => {
    if (!activeId) return null
    for (const stage of PIPELINE_ORDER) {
      const found = (clientsByStage[stage] ?? []).find(c => c.id === activeId)
      if (found) return toCardClient(found)
    }
    return null
  }, [activeId, clientsByStage])

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (over && active.id !== over.id) {
      const targetStage = over.id as PipelineStage
      if (PIPELINE_ORDER.includes(targetStage)) {
        onMoveClient(active.id as string, targetStage)
      }
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_ORDER.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            clients={clientsByStage[stage] ?? []}
            toCardClient={toCardClient}
            urgentDays={urgentDays}
            compact={compact}
            selectedIds={selectedIds}
            onSelectClient={onSelectClient}
            activeId={activeId}
            onAddClient={onAddClient}
          />
        ))}
      </div>

      {/* Drag overlay — follows cursor */}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
        {activeClient && (
          <div className="w-[260px] rotate-2 opacity-90">
            <KanbanCard
              client={activeClient}
              urgentDays={urgentDays}
              compact={compact}
              isDragging
              onDragStart={() => {}}
              onDragEnd={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ─── Stage Column (droppable) ───

function StageColumn({ stage, clients, toCardClient, urgentDays, compact, selectedIds, onSelectClient, activeId, onAddClient }: {
  stage: PipelineStage
  clients: Client[]
  toCardClient: (c: Client) => KanbanCardClient
  urgentDays: number
  compact: boolean
  selectedIds?: Set<string>
  onSelectClient?: (id: string) => void
  activeId: string | null
  onAddClient: (stage: PipelineStage) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const meta = PIPELINE_STAGES[stage]

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[280px] shrink-0 flex-col rounded-xl border transition-colors ${
        isOver
          ? 'border-immo-accent-green/50 bg-immo-accent-green/5'
          : 'border-immo-border-default bg-immo-bg-primary/50'
      }`}
    >
      <div className="flex items-center justify-between border-b border-immo-border-default px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
          <span className="text-xs font-semibold text-immo-text-primary">{meta.label}</span>
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-immo-bg-card-hover px-1.5 text-[10px] font-bold text-immo-text-muted">
            {clients.length}
          </span>
        </div>
        <button onClick={() => onAddClient(stage)} className="rounded-md p-1 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-accent-green">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: '60vh' }}>
        {clients.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-immo-text-muted">Aucun client</div>
        ) : (
          clients.map(client => (
            <DraggableCard
              key={client.id}
              client={toCardClient(client)}
              urgentDays={urgentDays}
              compact={compact}
              selected={selectedIds?.has(client.id)}
              onSelect={onSelectClient}
              isDragging={activeId === client.id}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Draggable Card ───

function DraggableCard({ client, urgentDays, compact, selected, onSelect, isDragging }: {
  client: KanbanCardClient
  urgentDays: number
  compact: boolean
  selected?: boolean
  onSelect?: (id: string) => void
  isDragging: boolean
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: client.id })

  const style = transform ? {
    transform: `translate(${transform.x}px, ${transform.y}px)`,
    opacity: isDragging ? 0.3 : 1,
    transition: isDragging ? undefined : 'transform 200ms ease',
  } : undefined

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <KanbanCard
        client={client}
        urgentDays={urgentDays}
        compact={compact}
        selected={selected}
        onSelect={onSelect}
        isDragging={false}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    </div>
  )
}
