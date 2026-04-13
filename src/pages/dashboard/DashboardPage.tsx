import { useTranslation } from 'react-i18next'
import {
  Building2,
  Home,
  CheckCircle,
  Bookmark,
  DollarSign,
  TrendingUp,
} from 'lucide-react'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { usePermissions } from '@/hooks/usePermissions'
import { KPICard, LoadingSpinner, StatusBadge } from '@/components/common'
import { formatPriceCompact } from '@/lib/constants'
import { HISTORY_TYPE_LABELS } from '@/types'
import type { HistoryType } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale'
import { ar as arLocale } from 'date-fns/locale'
import { AgentDashboard } from './AgentDashboard'
// OnboardingWizard + TrialBanner are rendered in AppLayout, not here

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useDashboardStats()
  const { isAgent } = usePermissions()
  const dateLocale = i18n.language === 'ar' ? arLocale : frLocale

  // Agent gets a dedicated dashboard
  if (isAgent) {
    return <AgentDashboard />
  }

  if (isLoading || !data) {
    return <LoadingSpinner size="lg" className="h-96" />
  }

  return (
    <div className="space-y-6">
      {/* Section 1 — KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard
          label={t('nav.projects')}
          value={data.activeProjects}
          subtitle={t('status.active')}
          accent="blue"
          icon={<Building2 className="h-5 w-5 text-immo-accent-blue" />}
        />
        <KPICard
          label={t('field.total_units')}
          value={data.totalUnits}
          accent="blue"
          icon={<Home className="h-5 w-5 text-immo-accent-blue" />}
        />
        <KPICard
          label={t('status.sold')}
          value={data.soldUnits}
          accent="green"
          icon={<CheckCircle className="h-5 w-5 text-immo-accent-green" />}
        />
        <KPICard
          label={t('status.reserved')}
          value={data.reservedUnits}
          accent="orange"
          icon={<Bookmark className="h-5 w-5 text-immo-status-orange" />}
        />
        <KPICard
          label={t('kpi.revenue')}
          value={formatPriceCompact(data.revenue)}
          accent="green"
          icon={<DollarSign className="h-5 w-5 text-immo-accent-green" />}
        />
        <KPICard
          label={t('kpi.conversion_rate')}
          value={`${data.saleRate.toFixed(1)}%`}
          accent={data.saleRate > 50 ? 'green' : data.saleRate > 25 ? 'orange' : 'red'}
          icon={<TrendingUp className="h-5 w-5 text-immo-accent-green" />}
        />
      </div>

      {/* Section 2 — Projects + Activity */}
      <div className="flex flex-col gap-6 xl:flex-row">
        {/* Left: Project progress */}
        <div className="min-w-0 flex-1 xl:max-w-[560px]">
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
            <div className="border-b border-immo-border-default px-5 py-4">
              <h3 className="text-sm font-semibold text-immo-text-primary">
                {t('dashboard.project_progress')}
              </h3>
            </div>
            <div className="max-h-[420px] divide-y divide-immo-border-default overflow-y-auto">
              {data.projectProgress.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-immo-text-muted">
                  {t('common.no_data')}
                </div>
              ) : (
                data.projectProgress.map((p) => {
                  const progress = p.total > 0 ? ((p.sold + p.reserved) / p.total) * 100 : 0
                  return (
                    <div key={p.id} className="px-5 py-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-immo-text-primary">{p.name}</span>
                          <span className="ml-2 text-xs text-immo-text-muted">{p.code}</span>
                        </div>
                        <span className="text-xs font-semibold text-immo-text-secondary">
                          {progress.toFixed(0)}%
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="mb-3 h-2 overflow-hidden rounded-full bg-immo-bg-primary">
                        <div className="flex h-full">
                          {p.sold > 0 && (
                            <div
                              className="bg-immo-accent-green"
                              style={{ width: `${(p.sold / p.total) * 100}%` }}
                            />
                          )}
                          {p.reserved > 0 && (
                            <div
                              className="bg-immo-status-orange"
                              style={{ width: `${(p.reserved / p.total) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>
                      {/* Counters */}
                      <div className="flex gap-4 text-[11px]">
                        <span className="text-immo-accent-green">{t('dashboard.sold_count', { count: p.sold })}</span>
                        <span className="text-immo-status-orange">{t('dashboard.reserved_count', { count: p.reserved })}</span>
                        <span className="text-immo-text-muted">{t('dashboard.available_count', { count: p.available })}</span>
                        {p.blocked > 0 && (
                          <span className="text-immo-status-red">{t('dashboard.blocked_count', { count: p.blocked })}</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: Recent activity */}
        <div className="min-w-0 flex-1 xl:max-w-[600px]">
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
            <div className="border-b border-immo-border-default px-5 py-4">
              <h3 className="text-sm font-semibold text-immo-text-primary">
                {t('dashboard.recent_activity')}
              </h3>
            </div>
            <div className="max-h-[420px] divide-y divide-immo-border-default overflow-y-auto">
              {data.recentActivity.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-immo-text-muted">
                  {t('common.no_data')}
                </div>
              ) : (
                data.recentActivity.map((a) => {
                  const meta = HISTORY_TYPE_LABELS[a.type as HistoryType]
                  return (
                    <div key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-immo-bg-primary text-immo-text-muted">
                        <ActivityIcon type={a.type} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-immo-text-primary">
                          {meta?.label ?? a.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-immo-text-muted">
                          <span>{a.client_name}</span>
                          <span>&middot;</span>
                          <span>{a.agent_name}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-immo-text-muted">
                        {formatDistanceToNow(new Date(a.created_at), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3 — Agent performance (admin/super_admin only) */}
      {!isAgent && data.agentPerformance.length > 0 && (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
          <div className="border-b border-immo-border-default px-5 py-4">
            <h3 className="text-sm font-semibold text-immo-text-primary">
              {t('dashboard.agent_performance')}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-immo-bg-card-hover">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">
                    {t('field.agent')}
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">
                    {t('kpi.reservations')}
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">
                    {t('kpi.sales')}
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">
                    {t('kpi.revenue')}
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">
                    {t('dashboard.last_activity')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-immo-border-default">
                {data.agentPerformance.map((agent) => (
                  <tr
                    key={agent.id}
                    className="bg-immo-bg-card transition-colors hover:bg-immo-bg-card-hover"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-immo-accent-blue/15 text-xs font-semibold text-immo-accent-blue">
                          {agent.first_name[0]}{agent.last_name[0]}
                        </div>
                        <span className="text-sm font-medium text-immo-text-primary">
                          {agent.first_name} {agent.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge
                        label={String(agent.reservations_count)}
                        type={agent.reservations_count > 0 ? 'orange' : 'muted'}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge
                        label={String(agent.sales_count)}
                        type={agent.sales_count > 0 ? 'green' : 'muted'}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-immo-accent-green">
                      {formatPriceCompact(agent.revenue)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-immo-text-muted">
                      {agent.last_activity
                        ? formatDistanceToNow(new Date(agent.last_activity), {
                            addSuffix: true,
                            locale: dateLocale,
                          })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Small icon component for activity types
function ActivityIcon({ type }: { type: string }) {
  // Using a colored dot instead of importing all lucide icons
  const colors: Record<string, string> = {
    stage_change: 'bg-immo-accent-blue',
    visit_planned: 'bg-immo-status-orange',
    visit_confirmed: 'bg-immo-accent-green',
    visit_completed: 'bg-immo-accent-green',
    call: 'bg-immo-accent-blue',
    whatsapp_call: 'bg-immo-accent-green',
    whatsapp_message: 'bg-immo-accent-green',
    sms: 'bg-immo-accent-blue',
    email: 'bg-immo-accent-blue',
    reservation: 'bg-immo-status-orange',
    sale: 'bg-immo-accent-green',
    payment: 'bg-immo-accent-green',
    document: 'bg-immo-text-muted',
    note: 'bg-immo-text-muted',
    ai_task: 'bg-immo-accent-blue',
  }

  return (
    <div className={`h-2.5 w-2.5 rounded-full ${colors[type] ?? 'bg-immo-text-muted'}`} />
  )
}
