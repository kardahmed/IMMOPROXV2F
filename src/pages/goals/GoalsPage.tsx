import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Target, Plus, Download, TrendingUp,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard, FilterDropdown, PageSkeleton, StatusBadge, Modal,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GOAL_METRIC_LABELS } from '@/types'
import type { GoalMetric, GoalPeriod, GoalStatus } from '@/types'
import { formatPriceCompact } from '@/lib/constants'
import {
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, format,
} from 'date-fns'
import toast from 'react-hot-toast'
import { exportToCsv } from '@/lib/exportCsv'

/* ═══ Types ═══ */

interface GoalRow {
  id: string
  agent_id: string
  agent_name: string
  metric: GoalMetric
  period: GoalPeriod
  target_value: number
  current_value: number
  started_at: string
  ended_at: string
  status: GoalStatus
  progress: number
}

interface AgentActuals {
  sales_count: number
  reservations_count: number
  visits_count: number
  revenue: number
  new_clients: number
  conversion_rate: number
}

const PERIOD_KEYS: Record<GoalPeriod, string> = { monthly: 'goals_page.monthly', quarterly: 'goals_page.quarterly', yearly: 'goals_page.yearly' }
const STATUS_CONFIG: Record<GoalStatus, { i18nKey: string; type: 'blue' | 'green' | 'red' | 'orange' }> = {
  in_progress: { i18nKey: 'goals_page.in_progress', type: 'blue' },
  achieved: { i18nKey: 'goals_page.achieved', type: 'green' },
  exceeded: { i18nKey: 'goals_page.exceeded', type: 'green' },
  not_achieved: { i18nKey: 'goals_page.not_achieved', type: 'red' },
}

const inputClass = 'border-immo-border-default bg-immo-bg-primary text-immo-text-primary placeholder:text-immo-text-muted'
const labelClass = 'text-[11px] font-medium text-immo-text-muted'

/* ═══ Component ═══ */

export function GoalsPage() {
  const { t } = useTranslation()
  const { tenantId } = useAuthStore()
  const { canManageGoals, isAgent } = usePermissions()
  const userId = useAuthStore((s) => s.session?.user?.id)

  const [statusFilter, setStatusFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)

  // Fetch agents
  const { data: agents = [] } = useQuery({
    queryKey: ['goal-agents', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name').eq('tenant_id', tenantId!).in('role', ['agent', 'admin']).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>
    },
    enabled: !!tenantId,
  })

  const agentMap = useMemo(() => {
    const m = new Map<string, string>()
    agents.forEach(a => m.set(a.id, `${a.first_name} ${a.last_name}`))
    return m
  }, [agents])

  // Fetch goals
  const { data: rawGoals = [], isLoading: loadingGoals } = useQuery({
    queryKey: ['goals', tenantId],
    queryFn: async () => {
      let q = supabase.from('agent_goals').select('*').eq('tenant_id', tenantId!)
      if (isAgent && userId) q = q.eq('agent_id', userId)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return data as unknown as Array<{
        id: string; agent_id: string; metric: GoalMetric; period: GoalPeriod
        target_value: number; current_value: number; status: GoalStatus
        started_at: string; ended_at: string
      }>
    },
    enabled: !!tenantId,
  })

  // Fetch actuals for all agents with goals
  const agentIds = useMemo(() => [...new Set(rawGoals.map(g => g.agent_id))], [rawGoals])

  // Tenant-wide window covering ALL agent goals so we can fetch the
  // actuals in a single round-trip per source table instead of N×4.
  // Audit (HIGH): the previous version did `for (agentId of agentIds)`
  // with 4 awaits per loop = 4×N round-trips. With 10 agents that's
  // 40 sequential queries per page open. Now: 4 queries, period.
  const { minStart, maxEnd } = useMemo(() => {
    if (rawGoals.length === 0) return { minStart: null, maxEnd: null }
    let minS = rawGoals[0].started_at
    let maxE = rawGoals[0].ended_at
    for (const g of rawGoals) {
      if (g.started_at < minS) minS = g.started_at
      if (g.ended_at > maxE) maxE = g.ended_at
    }
    return { minStart: minS, maxEnd: maxE }
  }, [rawGoals])

  const { data: actuals = new Map<string, AgentActuals>(), isLoading: loadingActuals } = useQuery({
    queryKey: ['goal-actuals', tenantId, minStart, maxEnd, agentIds.join(',')],
    queryFn: async () => {
      if (agentIds.length === 0 || !minStart || !maxEnd) return new Map<string, AgentActuals>()

      const [salesRes, resRes, visitsRes, clientsRes] = await Promise.all([
        supabase.from('sales')
          .select('id, final_price, agent_id')
          .in('agent_id', agentIds)
          .eq('status', 'active')
          .gte('created_at', minStart)
          .lte('created_at', maxEnd),
        supabase.from('reservations')
          .select('id, agent_id')
          .in('agent_id', agentIds)
          .eq('status', 'active')
          .gte('created_at', minStart)
          .lte('created_at', maxEnd),
        supabase.from('visits')
          .select('id, agent_id')
          .in('agent_id', agentIds)
          .eq('status', 'completed')
          .gte('scheduled_at', minStart)
          .lte('scheduled_at', maxEnd),
        supabase.from('clients')
          .select('id, agent_id')
          .in('agent_id', agentIds)
          .gte('created_at', minStart)
          .lte('created_at', maxEnd),
      ])

      const map = new Map<string, AgentActuals>()
      for (const id of agentIds) {
        map.set(id, {
          sales_count: 0,
          reservations_count: 0,
          visits_count: 0,
          revenue: 0,
          new_clients: 0,
          conversion_rate: 0,
        })
      }

      for (const s of (salesRes.data ?? []) as Array<{ agent_id: string; final_price?: number }>) {
        const a = map.get(s.agent_id)
        if (a) { a.sales_count++; a.revenue += s.final_price ?? 0 }
      }
      for (const r of (resRes.data ?? []) as Array<{ agent_id: string }>) {
        const a = map.get(r.agent_id)
        if (a) a.reservations_count++
      }
      for (const v of (visitsRes.data ?? []) as Array<{ agent_id: string }>) {
        const a = map.get(v.agent_id)
        if (a) a.visits_count++
      }
      for (const c of (clientsRes.data ?? []) as Array<{ agent_id: string }>) {
        const a = map.get(c.agent_id)
        if (a) a.new_clients++
      }
      // Conversion rate after totals are known.
      for (const a of map.values()) {
        a.conversion_rate = a.new_clients > 0 ? (a.sales_count / a.new_clients) * 100 : 0
      }

      return map
    },
    enabled: !!tenantId && agentIds.length > 0 && !!minStart && !!maxEnd,
  })

  // Build goal rows with computed values
  const goals: GoalRow[] = useMemo(() => {
    return rawGoals.map(g => {
      const agentActuals = actuals.get(g.agent_id)
      const currentValue = agentActuals ? agentActuals[g.metric] : g.current_value
      const progress = g.target_value > 0 ? Math.min((currentValue / g.target_value) * 100, 150) : 0
      const now = new Date()
      const ended = new Date(g.ended_at)

      let computedStatus: GoalStatus = g.status
      if (now <= ended) {
        computedStatus = progress >= 110 ? 'exceeded' : progress >= 100 ? 'achieved' : 'in_progress'
      } else {
        computedStatus = progress >= 110 ? 'exceeded' : progress >= 100 ? 'achieved' : 'not_achieved'
      }

      return {
        id: g.id,
        agent_id: g.agent_id,
        agent_name: agentMap.get(g.agent_id) ?? '-',
        metric: g.metric,
        period: g.period,
        target_value: g.target_value,
        current_value: Math.round(currentValue * 100) / 100,
        started_at: g.started_at,
        ended_at: g.ended_at,
        status: computedStatus,
        progress: Math.round(progress),
      }
    })
  }, [rawGoals, actuals, agentMap])

  // Filter
  const filtered = useMemo(() => {
    return goals.filter(g => {
      if (statusFilter !== 'all' && g.status !== statusFilter) return false
      if (agentFilter !== 'all' && g.agent_id !== agentFilter) return false
      return true
    })
  }, [goals, statusFilter, agentFilter])

  // KPIs
  const totalGoals = goals.length
  const inProgress = goals.filter(g => g.status === 'in_progress').length
  const achieved = goals.filter(g => g.status === 'achieved' || g.status === 'exceeded').length
  const avgProgress = goals.length > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0

  // Filter options
  const statusOptions = [
    { value: 'all', label: t('goals_page.all_status') },
    { value: 'in_progress', label: t('goals_page.in_progress') },
    { value: 'achieved', label: t('goals_page.achieved') },
    { value: 'exceeded', label: t('goals_page.exceeded') },
    { value: 'not_achieved', label: t('goals_page.not_achieved') },
  ]
  const agentOptions = [
    { value: 'all', label: t('goals_page.all_agents') },
    ...agents.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` })),
  ]

  function formatMetricValue(metric: GoalMetric, value: number): string {
    if (metric === 'revenue') return formatPriceCompact(value)
    if (metric === 'conversion_rate') return `${value.toFixed(1)}%`
    return String(Math.round(value))
  }

  const isLoading = loadingGoals || loadingActuals

  if (isLoading) return <PageSkeleton kpiCount={4} hasTable />

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label={t('goals_page.total_goals')} value={totalGoals} accent="blue" icon={<Target className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label={t('goals_page.in_progress')} value={inProgress} accent="orange" icon={<Target className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label={t('goals_page.achieved_kpi')} value={achieved} accent="green" icon={<Target className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label={t('goals_page.avg_progress')} value={`${avgProgress}%`} accent={avgProgress >= 80 ? 'green' : avgProgress >= 50 ? 'orange' : 'red'} icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {!isAgent && <FilterDropdown label={t('goals_page.agent')} options={agentOptions} value={agentFilter} onChange={setAgentFilter} />}
        <FilterDropdown label={t('goals_page.status')} options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
        <Button variant="ghost" size="sm" onClick={() => exportToCsv('objectifs', filtered, [
          { header: t('goals_page.agent'), value: r => r.agent_name },
          { header: t('goals_page.metric'), value: r => GOAL_METRIC_LABELS[r.metric] ?? r.metric },
          { header: t('goals_page.period'), value: r => r.period },
          { header: t('goals_page.target'), value: r => r.target_value },
          { header: t('goals_page.current'), value: r => r.current_value },
          { header: t('goals_page.progress'), value: r => `${r.progress}%` },
          { header: t('goals_page.status'), value: r => r.status },
        ])} className="border border-immo-border-default text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover">
          <Download className="me-1 h-3.5 w-3.5" /> {t('goals_page.export')}
        </Button>
        {canManageGoals && (
          <Button onClick={() => setShowCreate(true)} className="ms-auto bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
            <Plus className="me-1 h-4 w-4" /> {t('goals_page.new_goal')}
          </Button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-immo-text-muted">{t('goals_page.no_goals')}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-immo-border-default">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-immo-bg-card-hover">
                  {[
                    t('goals_page.agent'),
                    t('goals_page.metric'),
                    t('goals_page.period'),
                    t('goals_page.target'),
                    t('goals_page.current'),
                    t('goals_page.progress'),
                    t('goals_page.status'),
                  ].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-immo-border-default">
                {filtered.map(g => {
                  const stCfg = STATUS_CONFIG[g.status]
                  const progressColor = g.progress >= 100 ? 'bg-immo-accent-green' : g.progress >= 70 ? 'bg-immo-status-orange' : 'bg-immo-status-red'
                  return (
                    <tr key={g.id} className="bg-immo-bg-card transition-colors hover:bg-immo-bg-card-hover">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-immo-text-primary">{g.agent_name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-secondary">{GOAL_METRIC_LABELS[g.metric]}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div>
                          <span className="text-xs text-immo-text-primary">{t(PERIOD_KEYS[g.period])}</span>
                          <p className="text-[10px] text-immo-text-muted">{format(new Date(g.started_at), 'dd/MM')} — {format(new Date(g.ended_at), 'dd/MM/yyyy')}</p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-immo-text-primary">
                        {formatMetricValue(g.metric, g.target_value)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-immo-accent-green">
                        {formatMetricValue(g.metric, g.current_value)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-[80px] overflow-hidden rounded-full bg-immo-bg-primary">
                            <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${Math.min(g.progress, 100)}%` }} />
                          </div>
                          <span className={`text-xs font-semibold ${g.progress >= 100 ? 'text-immo-accent-green' : g.progress >= 70 ? 'text-immo-status-orange' : 'text-immo-status-red'}`}>
                            {g.progress}%
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge label={t(stCfg.i18nKey)} type={stCfg.type} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create modal */}
      <CreateGoalModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        agents={agents}
        tenantId={tenantId!}
      />
    </div>
  )
}

/* ═══ Create Goal Modal ═══ */

function CreateGoalModal({ isOpen, onClose, agents, tenantId }: {
  isOpen: boolean
  onClose: () => void
  agents: Array<{ id: string; first_name: string; last_name: string }>
  tenantId: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [agentId, setAgentId] = useState('')
  const [metric, setMetric] = useState<GoalMetric>('sales_count')
  const [period, setPeriod] = useState<GoalPeriod>('monthly')
  const [targetValue, setTargetValue] = useState('')

  // Auto-compute dates
  const now = new Date()
  const dates = useMemo(() => {
    switch (period) {
      case 'monthly': return { start: startOfMonth(now), end: endOfMonth(now) }
      case 'quarterly': return { start: startOfQuarter(now), end: endOfQuarter(now) }
      case 'yearly': return { start: startOfYear(now), end: endOfYear(now) }
    }
  }, [period])

  const createGoal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('agent_goals').insert({
        tenant_id: tenantId,
        agent_id: agentId,
        metric,
        period,
        target_value: Number(targetValue),
        current_value: 0,
        status: 'in_progress',
        started_at: format(dates.start, 'yyyy-MM-dd'),
        ended_at: format(dates.end, 'yyyy-MM-dd'),
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] })
      toast.success(t('goals_page.created_success'))
      resetAndClose()
    },
  })

  function resetAndClose() {
    setAgentId(''); setMetric('sales_count'); setPeriod('monthly'); setTargetValue('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title={t('goals_page.new_goal')} subtitle={t('goals_page.create_subtitle')} size="sm">
      <div className="space-y-4">
        <div>
          <Label className={labelClass}>{t('goals_page.agent')} *</Label>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={`mt-1 h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
            <option value="">{t('goals_page.select_agent')}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
          </select>
        </div>

        <div>
          <Label className={labelClass}>{t('goals_page.metric')} *</Label>
          <select value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)} className={`mt-1 h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
            {Object.entries(GOAL_METRIC_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
        </div>

        <div>
          <Label className={labelClass}>{t('goals_page.period')} *</Label>
          <select value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)} className={`mt-1 h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
            {Object.entries(PERIOD_KEYS).map(([val, key]) => <option key={val} value={val}>{t(key)}</option>)}
          </select>
          <p className="mt-1 text-[10px] text-immo-text-muted">
            {format(dates.start, 'dd/MM/yyyy')} → {format(dates.end, 'dd/MM/yyyy')}
          </p>
        </div>

        <div>
          <Label className={labelClass}>{t('goals_page.target_value')} *</Label>
          <Input
            type="number"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder={metric === 'revenue' ? '50000000' : metric === 'conversion_rate' ? '25' : '10'}
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-immo-border-default pt-4">
          <Button variant="ghost" onClick={resetAndClose} className="text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
            {t('goals_page.cancel')}
          </Button>
          <Button
            onClick={() => createGoal.mutate()}
            disabled={!agentId || !targetValue || createGoal.isPending}
            className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90"
          >
            {createGoal.isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-immo-bg-primary border-t-transparent" /> : t('goals_page.create_action')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
