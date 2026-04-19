import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { PIPELINE_STAGES, SOURCE_LABELS } from '@/types'
import type { Client, PipelineStage, ClientSource } from '@/types'
import { formatPriceCompact } from '@/lib/constants'
import { Button } from '@/components/ui/button'

type SortCol = 'full_name' | 'pipeline_stage' | 'confirmed_budget' | 'days' | 'created_at'
type SortDir = 'asc' | 'desc'

interface TableViewProps {
  clients: Client[]
  daysInStageMap: Map<string, number>
  agentMap: Map<string, string>
  projectMap: Map<string, string>
  urgentDays: number
  onChangeStage?: (clientId: string, stage: PipelineStage) => void
}

const PAGE_SIZE = 25

export function TableView({ clients, daysInStageMap, agentMap, projectMap, urgentDays }: TableViewProps) {
  const navigate = useNavigate()
  const [sortCol, setSortCol] = useState<SortCol>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
    setPage(0)
  }

  const sorted = useMemo(() => {
    return [...clients].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortCol) {
        case 'full_name':
          return a.full_name.localeCompare(b.full_name) * dir
        case 'pipeline_stage':
          return a.pipeline_stage.localeCompare(b.pipeline_stage) * dir
        case 'confirmed_budget':
          return ((a.confirmed_budget ?? 0) - (b.confirmed_budget ?? 0)) * dir
        case 'days':
          return ((daysInStageMap.get(a.id) ?? 0) - (daysInStageMap.get(b.id) ?? 0)) * dir
        case 'created_at':
        default:
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
      }
    })
  }, [clients, sortCol, sortDir, daysInStageMap])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function SortHeader({ col, label, className }: { col: SortCol; label: string; className?: string }) {
    const active = sortCol === col
    return (
      <th
        className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted hover:text-immo-text-secondary ${className ?? ''}`}
        onClick={() => toggleSort(col)}
      >
        <span className="flex items-center gap-1">
          {label}
          <ArrowUpDown className={`h-3 w-3 ${active ? 'text-immo-accent-green' : 'opacity-30'}`} />
        </span>
      </th>
    )
  }

  return (
    <div className="space-y-3">
      {/* Mobile cards (<768px) */}
      <div className="space-y-2 md:hidden">
        {paged.length === 0 ? (
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-card py-12 text-center text-sm text-immo-text-muted">Aucun client</div>
        ) : (
          paged.map((c) => {
            const stage = PIPELINE_STAGES[c.pipeline_stage]
            const days = daysInStageMap.get(c.id) ?? 0
            const agentName = c.agent_id ? agentMap.get(c.agent_id) ?? '-' : '-'
            const projectName = c.interested_projects?.[0] ? projectMap.get(c.interested_projects[0]) ?? '-' : '-'
            return (
              <button key={c.id} onClick={() => navigate(`/pipeline/clients/${c.id}`)}
                className="flex w-full flex-col gap-2 rounded-xl border border-immo-border-default bg-immo-bg-card p-3 text-left transition-colors hover:bg-immo-bg-card-hover">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-immo-text-primary">{c.full_name}</p>
                      {c.is_priority && <span className="h-2 w-2 shrink-0 rounded-full bg-immo-status-orange" />}
                    </div>
                    <p className="truncate text-xs text-immo-text-muted">{c.phone}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: stage.color + '20', color: stage.color }}>
                    {stage.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-immo-text-muted">
                  <div className="truncate"><span className="opacity-60">Source: </span>{SOURCE_LABELS[c.source as ClientSource] ?? c.source}</div>
                  <div className="truncate"><span className="opacity-60">Projet: </span>{projectName}</div>
                  <div className="truncate"><span className="opacity-60">Agent: </span>{agentName}</div>
                  <div className="truncate"><span className="opacity-60">Budget: </span>
                    <span className="font-semibold text-immo-accent-green">
                      {c.confirmed_budget != null ? formatPriceCompact(c.confirmed_budget) : '-'}
                    </span>
                  </div>
                  <div className={`truncate ${days > urgentDays ? 'text-immo-status-red' : days > 3 ? 'text-immo-status-orange' : ''}`}>
                    <span className="opacity-60">Jours: </span><span className="font-semibold">{days}j</span>
                  </div>
                  <div className="truncate"><span className="opacity-60">Contact: </span>
                    {c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString('fr-FR') : '-'}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Desktop/tablet table (>=768px) */}
      <div className="hidden overflow-hidden rounded-xl border border-immo-border-default md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-immo-bg-card-hover">
                <SortHeader col="full_name" label="Client" />
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">Téléphone</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">Source</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">Projet</th>
                <SortHeader col="confirmed_budget" label="Budget" />
                <SortHeader col="pipeline_stage" label="Étape" />
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">Agent</th>
                <SortHeader col="days" label="Jours" />
                <SortHeader col="created_at" label="Dernière action" />
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-immo-border-default">
              {paged.length === 0 ? (
                <tr><td colSpan={10} className="py-16 text-center text-sm text-immo-text-muted">Aucun client</td></tr>
              ) : (
                paged.map((c) => {
                  const stage = PIPELINE_STAGES[c.pipeline_stage]
                  const days = daysInStageMap.get(c.id) ?? 0
                  const agentName = c.agent_id ? agentMap.get(c.agent_id) ?? '-' : '-'
                  const projectName = c.interested_projects?.[0] ? projectMap.get(c.interested_projects[0]) ?? '-' : '-'

                  return (
                    <tr key={c.id} className="bg-immo-bg-card transition-colors hover:bg-immo-bg-card-hover">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-immo-text-primary">{c.full_name}</span>
                          {c.is_priority && <span className="h-2 w-2 rounded-full bg-immo-status-orange" />}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-immo-text-muted">{c.phone}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-muted">
                        {SOURCE_LABELS[c.source as ClientSource] ?? c.source}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-muted">{projectName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-immo-accent-green">
                        {c.confirmed_budget != null ? formatPriceCompact(c.confirmed_budget) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: stage.color + '20', color: stage.color }}
                        >
                          {stage.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-muted">{agentName}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`text-xs font-semibold ${
                            days > urgentDays
                              ? 'text-immo-status-red'
                              : days > 3
                                ? 'text-immo-status-orange'
                                : 'text-immo-text-muted'
                          }`}
                        >
                          {days}j
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-muted">
                        {c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <button
                          onClick={() => navigate(`/pipeline/clients/${c.id}`)}
                          className="rounded-md p-1.5 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-accent-green"
                          title="Voir fiche"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination (desktop) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-immo-border-default bg-immo-bg-card-hover px-4 py-2.5">
            <span className="text-xs text-immo-text-muted">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} sur {sorted.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="h-7 w-7 p-0 text-immo-text-muted disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const p = page < 3 ? i : page > totalPages - 3 ? totalPages - 5 + i : page - 2 + i
                if (p < 0 || p >= totalPages) return null
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`flex h-7 w-7 items-center justify-center rounded-md text-xs ${
                      page === p
                        ? 'bg-immo-accent-green/10 font-semibold text-immo-accent-green'
                        : 'text-immo-text-muted hover:bg-immo-bg-card'
                    }`}
                  >
                    {p + 1}
                  </button>
                )
              })}
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 w-7 p-0 text-immo-text-muted disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Pagination mobile */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-immo-border-default bg-immo-bg-card px-3 py-2 md:hidden">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}
            className="h-9 px-3 text-xs text-immo-text-muted disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-immo-text-muted">{page + 1} / {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
            className="h-9 px-3 text-xs text-immo-text-muted disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
