import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Eye, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { PIPELINE_STAGES, SOURCE_LABELS } from '@/types'
import type { Client, PipelineStage, ClientSource } from '@/types'
import { formatPriceCompact } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { EngagementBadge } from '@/components/common'

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
  const { t } = useTranslation()
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
          return (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()) * dir
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
      <div className="overflow-hidden rounded-xl border border-immo-border-default">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-immo-bg-card-hover">
                <SortHeader col="full_name" label={t('pipeline_table.client')} />
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{t('pipeline_table.score')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{t('pipeline_table.phone')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{t('pipeline_table.source')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{t('pipeline_table.project')}</th>
                <SortHeader col="confirmed_budget" label={t('pipeline_table.budget')} />
                <SortHeader col="pipeline_stage" label={t('pipeline_table.stage')} />
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{t('pipeline_table.agent')}</th>
                <SortHeader col="days" label={t('pipeline_table.days')} />
                <SortHeader col="created_at" label={t('pipeline_table.last_action')} />
                <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{t('pipeline_table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-immo-border-default">
              {paged.length === 0 ? (
                <tr><td colSpan={11} className="py-16 text-center text-sm text-immo-text-muted">{t('pipeline_table.no_clients')}</td></tr>
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
                      <td className="whitespace-nowrap px-4 py-3">
                        <EngagementBadge score={(c as Client & { engagement_score?: number | null }).engagement_score} />
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
                          {t('pipeline_table.days_short', { count: days })}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-muted">
                        {c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <button
                          onClick={() => navigate(`/pipeline/clients/${c.id}`)}
                          className="rounded-md p-1.5 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-accent-green"
                          title={t('pipeline_table.view_card')}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-immo-border-default bg-immo-bg-card-hover px-4 py-2.5">
            <span className="text-xs text-immo-text-muted">
              {t('pipeline_table.page_range', {
                from: page * PAGE_SIZE + 1,
                to: Math.min((page + 1) * PAGE_SIZE, sorted.length),
                total: sorted.length,
              })}
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
    </div>
  )
}
