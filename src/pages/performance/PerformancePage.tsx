import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  RefreshCw, Download, Target, X, AlertTriangle,
  DollarSign, TrendingUp, Users, Eye, Activity, CheckCircle,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { KPICard, FilterDropdown, PageSkeleton, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { PIPELINE_STAGES, SOURCE_LABELS } from '@/types'
import { exportToCsv } from '@/lib/exportCsv'
import type { PipelineStage, ClientSource } from '@/types'
import { formatPriceCompact } from '@/lib/constants'
import { PIPELINE_ORDER } from '@/lib/constants'
import {
  format, startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear,
  endOfDay, endOfWeek, endOfMonth, endOfQuarter, endOfYear,
  eachDayOfInterval,
} from 'date-fns'
import { fr } from 'date-fns/locale'

/* ═══ Types ═══ */

type PeriodKey = 'today' | 'week' | 'month' | 'quarter' | 'year'

const PERIOD_KEYS: PeriodKey[] = ['today', 'week', 'month', 'quarter', 'year']

const CHART_COLORS = ['#00D4A0', '#3782FF', '#FF9A1E', '#A855F7', '#06B6D4', '#EAB308', '#F97316', '#EC4899', '#FF4949', '#7F96B7']

function getPeriodRange(key: PeriodKey) {
  const now = new Date()
  switch (key) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) }
    case 'week': return { start: startOfWeek(now, { locale: fr }), end: endOfWeek(now, { locale: fr }) }
    case 'month': return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'quarter': return { start: startOfQuarter(now), end: endOfQuarter(now) }
    case 'year': return { start: startOfYear(now), end: endOfYear(now) }
  }
}


/* ═══ Component ═══ */

export function PerformancePage() {
  const { t } = useTranslation()
  const { tenantId } = useAuthStore()
  const { isAgent } = usePermissions()
  const userId = useAuthStore((s) => s.session?.user?.id)
  const qc = useQueryClient()

  const [period, setPeriod] = useState<PeriodKey>('month')
  const [agentFilter, setAgentFilter] = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [showAlert, setShowAlert] = useState(true)

  const range = getPeriodRange(period)
  const rangeStart = format(range.start, 'yyyy-MM-dd\'T\'HH:mm:ss')
  const rangeEnd = format(range.end, 'yyyy-MM-dd\'T\'HH:mm:ss')

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['perf'] })
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, qc])

  // Fetch all performance data
  const { data, isLoading } = useQuery({
    queryKey: ['perf', tenantId, rangeStart, rangeEnd, agentFilter],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const agentEq = isAgent && userId ? userId : agentFilter !== 'all' ? agentFilter : null

      // Build queries with optional agent filter
      function withAgent<T>(q: T & { eq: (col: string, val: string) => T }) {
        return agentEq ? q.eq('agent_id', agentEq) : q
      }

      const [salesRes, clientsRes, visitsRes, historyRes, agentsRes, pipelineRes] = await Promise.all([
        withAgent(supabase.from('sales').select('id, final_price, created_at, agent_id').eq('tenant_id', tenantId).eq('status', 'active').gte('created_at', rangeStart).lte('created_at', rangeEnd)) as unknown as Promise<{ data: Array<{ id: string; final_price: number; created_at: string }> | null; error: unknown }>,

        withAgent(supabase.from('clients').select('id, source, created_at, agent_id').eq('tenant_id', tenantId).gte('created_at', rangeStart).lte('created_at', rangeEnd)) as unknown as Promise<{ data: Array<{ id: string; source: string; created_at: string }> | null; error: unknown }>,

        withAgent(supabase.from('visits').select('id, status, scheduled_at, agent_id').eq('tenant_id', tenantId).gte('scheduled_at', rangeStart).lte('scheduled_at', rangeEnd)) as unknown as Promise<{ data: Array<{ id: string; status: string; scheduled_at: string }> | null; error: unknown }>,

        supabase.from('history').select('id, type, created_at').eq('tenant_id', tenantId).gte('created_at', rangeStart).lte('created_at', rangeEnd) as unknown as Promise<{ data: Array<{ id: string; type: string; created_at: string }> | null; error: unknown }>,

        supabase.from('users').select('id, first_name, last_name, last_activity').eq('tenant_id', tenantId).eq('status', 'active').in('role', ['agent', 'admin']) as unknown as Promise<{ data: Array<{ id: string; first_name: string; last_name: string; last_activity: string | null }> | null; error: unknown }>,

        supabase.from('clients').select('id, pipeline_stage').eq('tenant_id', tenantId) as unknown as Promise<{ data: Array<{ id: string; pipeline_stage: PipelineStage }> | null; error: unknown }>,
      ])

      return {
        sales: (salesRes.data ?? []),
        clients: (clientsRes.data ?? []),
        visits: (visitsRes.data ?? []),
        history: (historyRes.data ?? []),
        agents: (agentsRes.data ?? []),
        pipeline: (pipelineRes.data ?? []),
      }
    },
    enabled: !!tenantId,
  })

  const sales = data?.sales ?? []
  const clients = data?.clients ?? []
  const visits = data?.visits ?? []
  const history = data?.history ?? []
  const allAgents = data?.agents ?? []
  const pipeline = data?.pipeline ?? []

  // KPIs
  const totalSales = sales.length
  const totalRevenue = sales.reduce((s, r) => s + r.final_price, 0)
  const completedVisits = visits.filter(v => v.status === 'completed').length
  const newClients = clients.length
  const conversionRate = newClients > 0 ? (totalSales / newClients) * 100 : 0
  const totalActivities = history.length

  // Inactive agents alert
  const inactiveAgents = useMemo(() => {
    const now = Date.now()
    return allAgents.filter(a => {
      const lastDate = a.last_activity ?? (a as Record<string, unknown>).created_at as string | null
      if (!lastDate) return false
      return (now - new Date(lastDate).getTime()) > 7 * 86400000
    }).map(a => {
      const lastDate = a.last_activity ?? (a as Record<string, unknown>).created_at as string | null
      return {
        name: `${a.first_name} ${a.last_name}`,
        days: lastDate ? Math.floor((now - new Date(lastDate).getTime()) / 86400000) : 0,
      }
    })
  }, [allAgents])

  // Chart 1: Revenue over time
  const revenueChart = useMemo(() => {
    const days = eachDayOfInterval({ start: range.start, end: range.end })
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd')
      const daySales = sales.filter(s => s.created_at.startsWith(dayStr))
      return {
        date: format(day, 'dd/MM'),
        revenue: daySales.reduce((s, r) => s + r.final_price, 0),
        count: daySales.length,
      }
    })
  }, [sales, range])

  // Chart 2: Sales by day
  const salesByDay = useMemo(() => {
    const days = eachDayOfInterval({ start: range.start, end: range.end })
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd')
      return {
        date: format(day, 'dd/MM'),
        sales: sales.filter(s => s.created_at.startsWith(dayStr)).length,
        visits: visits.filter(v => v.scheduled_at.startsWith(dayStr)).length,
      }
    })
  }, [sales, visits, range])

  // Chart 3: Pipeline funnel
  const funnelData = useMemo(() => {
    return PIPELINE_ORDER.map(stage => {
      const count = pipeline.filter(c => c.pipeline_stage === stage).length
      const meta = PIPELINE_STAGES[stage]
      return { name: meta.label, value: count, color: meta.color, stage }
    })
  }, [pipeline])
  const funnelMax = Math.max(...funnelData.map(d => d.value), 1)

  // Chart 4: Sources donut
  const sourceData = useMemo(() => {
    const counts = new Map<string, number>()
    clients.forEach(c => counts.set(c.source, (counts.get(c.source) ?? 0) + 1))
    return Array.from(counts.entries())
      .map(([source, count], i) => ({
        name: SOURCE_LABELS[source as ClientSource] ?? source,
        value: count,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
  }, [clients])
  const sourceTotal = sourceData.reduce((s, d) => s + d.value, 0)

  // Filter options
  const agentOptions = [
    { value: 'all', label: t('performance_page.all_agents') },
    ...allAgents.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` })),
  ]

  if (isLoading) return <PageSkeleton kpiCount={5} />

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('performance_page.title')}
        subtitle={t('performance_page.subtitle')}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-immo-border-default p-0.5">
          {PERIOD_KEYS.map(key => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${period === key ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted hover:text-immo-text-secondary'}`}
            >
              {t(`performance_page.period_${key}`)}
            </button>
          ))}
        </div>
        {!isAgent && <FilterDropdown label={t('performance_page.agent')} options={agentOptions} value={agentFilter} onChange={setAgentFilter} />}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
              autoRefresh ? 'border-immo-accent-green/50 bg-immo-accent-green/10 text-immo-accent-green' : 'border-immo-border-default text-immo-text-muted'
            }`}
          >
            <RefreshCw className={`h-3 w-3 ${autoRefresh ? 'animate-spin' : ''}`} /> {t('performance_page.auto')}
          </button>
          <Button variant="ghost" size="sm" onClick={() => exportToCsv('performance', sales, [
            { header: 'ID', value: r => r.id },
            { header: 'Prix final', value: r => r.final_price },
            { header: 'Date', value: r => r.created_at },
          ])} className="border border-immo-border-default text-xs text-immo-text-secondary">
            <Download className="mr-1 h-3.5 w-3.5" /> {t('performance_page.export')}
          </Button>
          <Link to="/goals">
            <Button variant="ghost" size="sm" className="border border-immo-border-default text-xs text-immo-text-secondary">
              <Target className="mr-1 h-3.5 w-3.5" /> {t('performance_page.goals')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Inactive alert */}
      {showAlert && inactiveAgents.length > 0 && !isAgent && (
        <div className="flex items-center gap-3 rounded-xl border border-immo-status-orange/30 bg-immo-status-orange-bg px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-immo-status-orange" />
          <div className="flex-1 text-xs text-immo-status-orange">
            <span className="font-semibold">{t('performance_page.inactive_agents', { count: inactiveAgents.length })}</span> {t('performance_page.inactive_since')}
            {inactiveAgents.slice(0, 3).map((a, i) => (
              <span key={a.name}>{i > 0 ? ', ' : ' '}{a.name} ({a.days}j)</span>
            ))}
            {inactiveAgents.length > 3 && <span>, +{inactiveAgents.length - 3}</span>}
          </div>
          <button onClick={() => setShowAlert(false)} className="text-immo-status-orange hover:text-immo-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard label={t('performance_page.kpi_sales')} value={totalSales} accent="green" icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label={t('performance_page.kpi_revenue')} value={formatPriceCompact(totalRevenue)} accent="green" icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label={t('performance_page.kpi_visits_completed')} value={completedVisits} accent="blue" icon={<CheckCircle className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label={t('performance_page.kpi_conversion')} value={`${conversionRate.toFixed(1)}%`} accent={conversionRate > 20 ? 'green' : 'orange'} icon={<Eye className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label={t('performance_page.kpi_new_clients')} value={newClients} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label={t('performance_page.kpi_activities')} value={totalActivities} accent="blue" icon={<Activity className="h-4 w-4 text-immo-accent-blue" />} />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Chart 1: Revenue */}
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">{t('performance_page.chart_revenue')}</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E325A" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7F96B7' }} stroke="#1E325A" />
                <YAxis tick={{ fontSize: 10, fill: '#7F96B7' }} stroke="#1E325A" tickFormatter={(v) => formatPriceCompact(v)} />
                <Tooltip
                  contentStyle={{ background: '#0F1830', border: '1px solid #1E325A', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#EDF4FC' }}
                  formatter={(value) => [formatPriceCompact(Number(value)), t('performance_page.chart_revenue_label')]}
                />
                <Line type="monotone" dataKey="revenue" stroke="#00D4A0" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Sales & Visits by day */}
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">{t('performance_page.chart_sales_visits')}</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E325A" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7F96B7' }} stroke="#1E325A" />
                <YAxis tick={{ fontSize: 10, fill: '#7F96B7' }} stroke="#1E325A" />
                <Tooltip contentStyle={{ background: '#0F1830', border: '1px solid #1E325A', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#EDF4FC' }} />
                <Bar dataKey="sales" fill="#00D4A0" radius={[4, 4, 0, 0]} name={t('performance_page.chart_sales')} />
                <Bar dataKey="visits" fill="#3782FF" radius={[4, 4, 0, 0]} name={t('performance_page.chart_visits')} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#7F96B7' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Pipeline funnel */}
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">{t('performance_page.chart_funnel')}</h3>
          <div className="space-y-2">
            {funnelData.map((d) => (
              <div key={d.stage} className="flex items-center gap-3">
                <span className="w-[110px] shrink-0 truncate text-xs text-immo-text-secondary">{d.name}</span>
                <div className="flex-1">
                  <div className="h-6 overflow-hidden rounded bg-immo-bg-primary">
                    <div
                      className="flex h-full items-center rounded px-2 text-[10px] font-semibold text-white"
                      style={{ width: `${Math.max((d.value / funnelMax) * 100, 2)}%`, background: d.color }}
                    >
                      {d.value > 0 ? d.value : ''}
                    </div>
                  </div>
                </div>
                <span className="w-[40px] shrink-0 text-right text-[11px] text-immo-text-muted">
                  {pipeline.length > 0 ? Math.round((d.value / pipeline.length) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 4: Sources donut */}
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">{t('performance_page.chart_sources')}</h3>
          {sourceData.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center text-sm text-immo-text-muted">{t('performance_page.no_data')}</div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="h-[200px] w-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="value"
                      stroke="none"
                    >
                      {sourceData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#0F1830', border: '1px solid #1E325A', borderRadius: 8, fontSize: 12 }}
                      formatter={(value, name) => [`${value} (${sourceTotal > 0 ? Math.round((Number(value) / sourceTotal) * 100) : 0}%)`, String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {sourceData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                    <span className="flex-1 truncate text-immo-text-secondary">{d.name}</span>
                    <span className="font-medium text-immo-text-primary">{d.value}</span>
                    <span className="w-[35px] text-right text-immo-text-muted">
                      {sourceTotal > 0 ? Math.round((d.value / sourceTotal) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
