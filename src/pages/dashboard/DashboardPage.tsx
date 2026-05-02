import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Home, CheckCircle, Bookmark, DollarSign, TrendingUp,
  Users, AlertTriangle, Calendar,
} from 'lucide-react'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { usePermissions } from '@/hooks/usePermissions'
import { Card, KPICard, PageSkeleton, StatusBadge } from '@/components/common'
import { formatPriceCompact } from '@/lib/constants'
import { HISTORY_TYPE_LABELS, PIPELINE_STAGES } from '@/types'
import type { HistoryType } from '@/types'
import { formatDistanceToNow, format } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale'
import { ar as arLocale } from 'date-fns/locale'
import { AgentDashboard } from './AgentDashboard'
const RevenueChart = lazy(() => import('./RevenueChart'))

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading } = useDashboardStats()
  const { isAgent } = usePermissions()
  const dateLocale = i18n.language === 'ar' ? arLocale : frLocale

  if (isAgent) return <AgentDashboard />
  if (isLoading || !data) return <PageSkeleton kpiCount={8} />

  return (
    <div className="space-y-6">
      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <KPICard label={t('nav.projects')} value={data.activeProjects} subtitle={t('status.active')} accent="blue" icon={<Building2 className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label={t('field.total_units')} value={data.totalUnits} accent="blue" icon={<Home className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label={t('status.sold')} value={data.soldUnits} accent="green" icon={<CheckCircle className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label={t('status.reserved')} value={data.reservedUnits} accent="orange" icon={<Bookmark className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label={t('kpi.revenue')} value={formatPriceCompact(data.revenue)} accent="green" icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label={t('kpi.total_clients')} value={data.totalClients} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label={t('dashboard.overdue_payments')} value={data.overduePayments} accent={data.overduePayments > 0 ? 'red' : 'green'} icon={<AlertTriangle className="h-4 w-4 text-immo-status-red" />} />
        <KPICard label={t('kpi.conversion_rate')} value={`${data.saleRate.toFixed(1)}%`} accent={data.saleRate > 50 ? 'green' : 'orange'} icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      {/* Row 2 — CA Chart + Pipeline Funnel */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* CA Mensuel */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">CA mensuel — 6 derniers mois</h3>
          <Suspense fallback={<div className="h-[200px] animate-pulse rounded bg-immo-bg-primary" />}>
            <RevenueChart data={data.monthlyRevenue} />
          </Suspense>
        </Card>

        {/* Pipeline Funnel */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">{t('dashboard.pipeline_funnel')}</h3>
          <div className="space-y-2">
            {data.pipelineFunnel.map(s => {
              const stage = PIPELINE_STAGES[s.stage as keyof typeof PIPELINE_STAGES]
              if (!stage) return null
              return (
                <div key={s.stage} className="flex items-center gap-3">
                  <div className="w-24 text-[11px] text-immo-text-secondary truncate">{stage.label}</div>
                  <div className="flex-1 h-5 rounded-full bg-immo-bg-primary overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(s.percentage, 2)}%`, backgroundColor: stage.color }} />
                  </div>
                  <div className="w-16 text-right text-xs font-semibold text-immo-text-primary">{s.count} <span className="text-immo-text-muted font-normal">({s.percentage.toFixed(0)}%)</span></div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Row 3 — Visites aujourd'hui + Taches + Clients à risque */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Visites aujourd'hui */}
        <Card noPadding>
          <div className="flex items-center justify-between border-b border-immo-border-default px-5 py-3">
            <h3 className="text-sm font-semibold text-immo-text-primary flex items-center gap-2">
              <Calendar className="h-4 w-4 text-immo-accent-blue" /> Visites aujourd'hui
            </h3>
            <span className="rounded-full bg-immo-accent-blue/10 px-2 py-0.5 text-[10px] font-bold text-immo-accent-blue">{data.todayVisits.length}</span>
          </div>
          <div className="max-h-[240px] divide-y divide-immo-border-default overflow-y-auto">
            {data.todayVisits.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-immo-text-muted">{t('dashboard.no_visit_today')}</div>
            ) : data.todayVisits.map(v => (
              <div key={v.id} className="px-5 py-3 hover:bg-immo-bg-card-hover transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-immo-text-primary">{v.client_name}</span>
                  <span className="text-xs font-mono text-immo-accent-blue">{format(new Date(v.scheduled_at), 'HH:mm')}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-immo-text-muted">
                  <span>{v.project_name}</span>
                  <span>&middot;</span>
                  <span>{v.agent_name}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Clients à risque */}
        <Card noPadding>
          <div className="flex items-center justify-between border-b border-immo-border-default px-5 py-3">
            <h3 className="text-sm font-semibold text-immo-text-primary flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-immo-status-red" /> Clients a risque
            </h3>
            <span className="rounded-full bg-immo-status-red/10 px-2 py-0.5 text-[10px] font-bold text-immo-status-red">{data.atRiskClients.length}</span>
          </div>
          <div className="max-h-[240px] divide-y divide-immo-border-default overflow-y-auto">
            {data.atRiskClients.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-immo-text-muted">{t('dashboard.all_clients_up_to_date')}</div>
            ) : data.atRiskClients.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-immo-bg-card-hover cursor-pointer transition-colors" onClick={() => navigate(`/pipeline/clients/${c.id}`)}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-immo-status-red/10 text-[10px] font-bold text-immo-status-red">
                  {c.days_without_contact}j
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-immo-text-primary truncate">{c.full_name}</p>
                  <p className="text-[10px] text-immo-text-muted">{c.agent_name}</p>
                </div>
                <StatusBadge label={PIPELINE_STAGES[c.pipeline_stage as keyof typeof PIPELINE_STAGES]?.label ?? c.pipeline_stage} type="orange" />
              </div>
            ))}
          </div>
        </Card>

        {/* Sources de leads */}
        <Card noPadding>
          <div className="border-b border-immo-border-default px-5 py-3">
            <h3 className="text-sm font-semibold text-immo-text-primary flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-immo-accent-green" /> Sources de leads
            </h3>
          </div>
          <div className="p-5 space-y-2">
            {data.sourceBreakdown.slice(0, 6).map(s => {
              const pct = data.totalClients > 0 ? (s.count / data.totalClients) * 100 : 0
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <div className="w-28 text-[11px] text-immo-text-secondary truncate capitalize">{s.source.replace(/_/g, ' ')}</div>
                  <div className="flex-1 h-3 rounded-full bg-immo-bg-primary overflow-hidden">
                    <div className="h-full rounded-full bg-immo-accent-green/60" style={{ width: `${Math.max(pct, 3)}%` }} />
                  </div>
                  <div className="w-12 text-right text-[11px] font-semibold text-immo-text-primary">{s.count}</div>
                </div>
              )
            })}
            {data.sourceBreakdown.length === 0 && (
              <div className="py-6 text-center text-xs text-immo-text-muted">{t('common.no_data')}</div>
            )}
          </div>
        </Card>
      </div>

      {/* Row 4 — Projects + Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Project progress */}
        <Card noPadding>
          <div className="border-b border-immo-border-default px-5 py-4">
            <h3 className="text-sm font-semibold text-immo-text-primary">{t('dashboard.project_progress')}</h3>
          </div>
          <div className="max-h-[350px] divide-y divide-immo-border-default overflow-y-auto">
            {data.projectProgress.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-immo-text-muted">{t('common.no_data')}</div>
            ) : data.projectProgress.map(p => {
              const progress = p.total > 0 ? ((p.sold + p.reserved) / p.total) * 100 : 0
              return (
                <div key={p.id} className="px-5 py-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-immo-text-primary">{p.name}</span>
                      <span className="ml-2 text-xs text-immo-text-muted">{p.code}</span>
                    </div>
                    <span className="text-xs font-semibold text-immo-text-secondary">{progress.toFixed(0)}%</span>
                  </div>
                  <div className="mb-2 h-2 overflow-hidden rounded-full bg-immo-bg-primary">
                    <div className="flex h-full">
                      {p.sold > 0 && <div className="bg-immo-accent-green" style={{ width: `${(p.sold / p.total) * 100}%` }} />}
                      {p.reserved > 0 && <div className="bg-immo-status-orange" style={{ width: `${(p.reserved / p.total) * 100}%` }} />}
                    </div>
                  </div>
                  <div className="flex gap-4 text-[11px]">
                    <span className="text-immo-accent-green">{p.sold} vendus</span>
                    <span className="text-immo-status-orange">{p.reserved} reserves</span>
                    <span className="text-immo-text-muted">{p.available} dispos</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Recent activity */}
        <Card noPadding>
          <div className="border-b border-immo-border-default px-5 py-4">
            <h3 className="text-sm font-semibold text-immo-text-primary">{t('dashboard.recent_activity')}</h3>
          </div>
          <div className="max-h-[350px] divide-y divide-immo-border-default overflow-y-auto">
            {data.recentActivity.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-immo-text-muted">{t('common.no_data')}</div>
            ) : data.recentActivity.map(a => {
              const meta = HISTORY_TYPE_LABELS[a.type as HistoryType]
              return (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-immo-bg-primary text-immo-text-muted">
                    <ActivityIcon type={a.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-immo-text-primary">{meta?.label ?? a.title}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-immo-text-muted">
                      <span>{a.client_name}</span><span>&middot;</span><span>{a.agent_name}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-immo-text-muted">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: dateLocale })}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Row 5 — Agent performance */}
      {data.agentPerformance.length > 0 && (
        <Card noPadding>
          <div className="border-b border-immo-border-default px-5 py-4">
            <h3 className="text-sm font-semibold text-immo-text-primary">{t('dashboard.agent_performance')}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-immo-bg-card-hover">
                  {[t('field.agent'), t('kpi.reservations'), t('kpi.sales'), t('kpi.revenue'), t('dashboard.last_activity')].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-immo-border-default">
                {data.agentPerformance.sort((a, b) => b.revenue - a.revenue).map(agent => (
                  <tr key={agent.id} className="bg-immo-bg-card hover:bg-immo-bg-card-hover transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-immo-accent-blue/15 text-xs font-semibold text-immo-accent-blue">
                          {agent.first_name[0]}{agent.last_name[0]}
                        </div>
                        <span className="text-sm font-medium text-immo-text-primary">{agent.first_name} {agent.last_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><StatusBadge label={String(agent.reservations_count)} type={agent.reservations_count > 0 ? 'orange' : 'muted'} /></td>
                    <td className="px-5 py-3.5"><StatusBadge label={String(agent.sales_count)} type={agent.sales_count > 0 ? 'green' : 'muted'} /></td>
                    <td className="px-5 py-3.5 text-sm font-medium text-immo-accent-green">{formatPriceCompact(agent.revenue)}</td>
                    <td className="px-5 py-3.5 text-xs text-immo-text-muted">
                      {agent.last_activity ? formatDistanceToNow(new Date(agent.last_activity), { addSuffix: true, locale: dateLocale }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function ActivityIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    stage_change: 'bg-immo-accent-blue', visit_planned: 'bg-immo-status-orange',
    visit_confirmed: 'bg-immo-accent-green', visit_completed: 'bg-immo-accent-green',
    call: 'bg-immo-accent-blue', whatsapp_call: 'bg-immo-accent-green',
    whatsapp_message: 'bg-immo-accent-green', sms: 'bg-immo-accent-blue',
    email: 'bg-immo-accent-blue', reservation: 'bg-immo-status-orange',
    sale: 'bg-immo-accent-green', payment: 'bg-immo-accent-green',
    document: 'bg-immo-text-muted', note: 'bg-immo-text-muted', ai_task: 'bg-immo-accent-blue',
  }
  return <div className={`h-2.5 w-2.5 rounded-full ${colors[type] ?? 'bg-immo-text-muted'}`} />
}
