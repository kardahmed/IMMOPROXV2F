import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Building2, Users as UsersIcon, Star } from 'lucide-react'
import { PIPELINE_STAGES, SOURCE_LABELS } from '@/types'
import type { Client, ClientSource } from '@/types'
import { PIPELINE_ORDER } from '@/lib/constants'
import { formatPriceCompact } from '@/lib/constants'
import { nameToColor } from '@/lib/avatarColor'

type SortKey = 'recent' | 'oldest' | 'priority'

interface CardsViewProps {
  clients: Client[]
  daysInStageMap: Map<string, number>
  agentMap: Map<string, string>
  projectMap: Map<string, string>
  urgentDays: number
}

export function CardsView({ clients, daysInStageMap, agentMap, projectMap, urgentDays }: CardsViewProps) {
  const navigate = useNavigate()
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('recent')

  const filtered = useMemo(() => {
    let list = stageFilter === 'all'
      ? clients
      : clients.filter((c) => c.pipeline_stage === stageFilter)

    list = [...list].sort((a, b) => {
      if (sort === 'priority') {
        if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1
        if (a.interest_level !== b.interest_level) return a.interest_level === 'high' ? -1 : 1
      }
      if (sort === 'oldest') return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    })

    return list
  }, [clients, stageFilter, sort])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto">
          <FilterPill active={stageFilter === 'all'} onClick={() => setStageFilter('all')} label={`Tous (${clients.length})`} />
          {PIPELINE_ORDER.map((stage) => {
            const count = clients.filter((c) => c.pipeline_stage === stage).length
            if (count === 0) return null
            const meta = PIPELINE_STAGES[stage]
            return (
              <FilterPill
                key={stage}
                active={stageFilter === stage}
                onClick={() => setStageFilter(stage)}
                label={`${meta.label} (${count})`}
                color={meta.color}
              />
            )
          })}
        </div>

        <div className="ml-auto flex gap-1 rounded-lg border border-immo-border-default p-0.5">
          {([
            { key: 'recent' as SortKey, label: 'Récent' },
            { key: 'oldest' as SortKey, label: 'Ancien' },
            { key: 'priority' as SortKey, label: 'Prioritaire' },
          ]).map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                sort === s.key ? 'bg-immo-accent-green/10 font-medium text-immo-accent-green' : 'text-immo-text-muted hover:text-immo-text-secondary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-immo-text-muted">Aucun client</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const stage = PIPELINE_STAGES[c.pipeline_stage]
            const days = daysInStageMap.get(c.id) ?? 0
            const color = nameToColor(c.full_name)
            const initials = c.full_name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
            const agentName = c.agent_id ? agentMap.get(c.agent_id) : null
            const projectName = c.interested_projects?.[0] ? projectMap.get(c.interested_projects[0]) : null

            return (
              <div
                key={c.id}
                onClick={() => navigate(`/pipeline/clients/${c.id}`)}
                className="group cursor-pointer rounded-xl border border-immo-border-default bg-immo-bg-card p-4 transition-colors hover:border-immo-border-glow/30"
              >
                {/* Header */}
                <div className="mb-3 flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                    style={{ backgroundColor: color + '20', color }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-immo-text-primary">{c.full_name}</p>
                      {c.is_priority && <Star className="h-3.5 w-3.5 shrink-0 fill-immo-status-orange text-immo-status-orange" />}
                    </div>
                    <span
                      className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: stage.color + '20', color: stage.color }}
                    >
                      {stage.label}
                    </span>
                  </div>
                  {/* Days badge */}
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      days > urgentDays
                        ? 'bg-immo-status-red-bg text-immo-status-red'
                        : days > 3
                          ? 'bg-immo-status-orange-bg text-immo-status-orange'
                          : 'bg-immo-bg-card-hover text-immo-text-muted'
                    }`}
                  >
                    {days}j
                  </span>
                </div>

                {/* Info rows */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-immo-text-muted">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span>{c.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-immo-text-muted">
                    <span className="rounded bg-immo-bg-primary px-1.5 py-0.5 text-[10px]">
                      {SOURCE_LABELS[c.source as ClientSource] ?? c.source}
                    </span>
                    {c.confirmed_budget != null && (
                      <span className="ml-auto text-xs font-medium text-immo-accent-green">
                        {formatPriceCompact(c.confirmed_budget)}
                      </span>
                    )}
                  </div>
                  {(agentName || projectName) && (
                    <div className="flex items-center gap-3 text-immo-text-muted">
                      {agentName && (
                        <span className="flex items-center gap-1 truncate">
                          <UsersIcon className="h-3 w-3 shrink-0" />{agentName}
                        </span>
                      )}
                      {projectName && (
                        <span className="flex items-center gap-1 truncate">
                          <Building2 className="h-3 w-3 shrink-0" />{projectName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterPill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition-colors ${
        active ? 'bg-immo-accent-green/10 font-medium text-immo-accent-green' : 'text-immo-text-muted hover:bg-immo-bg-card-hover'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  )
}
