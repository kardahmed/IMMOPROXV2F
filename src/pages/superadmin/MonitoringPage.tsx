import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle, Zap, Shield, Cpu, Database } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, KPICard, LoadingSpinner, PageHeader, StatusBadge } from '@/components/common'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import { format, subDays, subHours } from 'date-fns'

const CHART_STYLE = { fontSize: 10, fill: '#8898AA' }

type TabKey = 'overview' | 'security' | 'usage'

export function MonitoringPage() {
  const [tab, setTab] = useState<TabKey>('overview')

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-monitoring-v2'],
    queryFn: async () => {
      const now = new Date()
      const oneDayAgo = subDays(now, 1).toISOString()
      const sevenDaysAgo = subDays(now, 7).toISOString()

      const [logsRes, errorsRes, allLogsRes, tenantSettingsRes, loginLogsRes] = await Promise.all([
        supabase.from('super_admin_logs').select('action, created_at, details, tenant_id').order('created_at', { ascending: false }).limit(100),
        supabase.from('super_admin_logs').select('id', { count: 'exact', head: true }).eq('action', 'error'),
        supabase.from('super_admin_logs').select('action, created_at').gte('created_at', sevenDaysAgo),
        supabase.from('tenant_settings').select('tenant_id, api_calls_count, storage_used_mb, ai_tokens_used' as never),
        supabase.from('super_admin_logs').select('action, created_at, details').eq('action', 'login').order('created_at', { ascending: false }).limit(20),
      ])

      const logs = (logsRes.data ?? []) as Array<{ action: string; created_at: string; details: Record<string, unknown> | null; tenant_id: string | null }>
      const allLogs = (allLogsRes.data ?? []) as Array<{ action: string; created_at: string }>

      // Action frequency
      const actionCounts = new Map<string, number>()
      for (const log of logs) actionCounts.set(log.action, (actionCounts.get(log.action) ?? 0) + 1)
      const functionStats = Array.from(actionCounts.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count).slice(0, 10)

      // Errors last 24h
      const errors24h = logs.filter(l => l.action === 'error' && new Date(l.created_at) > new Date(oneDayAgo))

      // Activity by hour (last 24h)
      const hourlyActivity: Array<{ hour: string; actions: number; errors: number }> = []
      for (let i = 23; i >= 0; i--) {
        const h = subHours(now, i)
        const hStr = format(h, 'HH:00')
        const hStart = new Date(h); hStart.setMinutes(0, 0, 0)
        const hEnd = new Date(h); hEnd.setMinutes(59, 59, 999)
        const actions = allLogs.filter(l => { const d = new Date(l.created_at); return d >= hStart && d <= hEnd }).length
        const errs = allLogs.filter(l => l.action === 'error' && (() => { const d = new Date(l.created_at); return d >= hStart && d <= hEnd })()).length
        hourlyActivity.push({ hour: hStr, actions, errors: errs })
      }

      // Activity by day (last 7 days)
      const dailyActivity: Array<{ day: string; actions: number }> = []
      for (let i = 6; i >= 0; i--) {
        const d = subDays(now, i)
        const dayStr = format(d, 'dd/MM')
        const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999)
        const actions = allLogs.filter(l => { const ld = new Date(l.created_at); return ld >= dayStart && ld <= dayEnd }).length
        dailyActivity.push({ day: dayStr, actions })
      }

      // Tenant usage
      const tenantUsage = (tenantSettingsRes.data ?? []) as unknown as Array<{ tenant_id: string; api_calls_count: number; storage_used_mb: number; ai_tokens_used: number }>

      // Login logs
      const loginLogs = (loginLogsRes.data ?? []) as Array<{ action: string; created_at: string; details: Record<string, unknown> | null }>

      // Error rate
      const totalActions24h = allLogs.filter(l => new Date(l.created_at) > new Date(oneDayAgo)).length
      const errorRate = totalActions24h > 0 ? (errors24h.length / totalActions24h) * 100 : 0

      return {
        recentLogs: logs.slice(0, 50),
        errorCount: errorsRes.count ?? 0,
        errors24h,
        totalActions: allLogs.length,
        errorRate,
        functionStats,
        hourlyActivity,
        dailyActivity,
        tenantUsage,
        loginLogs,
      }
    },
    refetchInterval: 60_000,
  })

  if (isLoading || !data) return <LoadingSpinner size="lg" className="h-96" />

  const healthStatus = data.errorRate > 10 ? 'Critique' : data.errorRate > 2 ? 'Degrade' : 'Operationnel'
  const healthColor = data.errorRate > 10 ? 'red' : data.errorRate > 2 ? 'orange' : 'green'

  const TABS: Array<{ key: TabKey; label: string; icon: typeof Activity }> = [
    { key: 'overview', label: 'Vue d\'ensemble', icon: Activity },
    { key: 'security', label: 'Securite & Connexions', icon: Shield },
    { key: 'usage', label: 'Usage par tenant', icon: Database },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring & Securite"
        subtitle="Sante de la plateforme, erreurs et activite recente"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KPICard label="Statut" value={healthStatus} accent={healthColor} icon={<CheckCircle className="h-5 w-5 text-immo-accent-green" />} />
        <KPICard label="Actions (7j)" value={data.totalActions} accent="blue" icon={<Activity className="h-5 w-5 text-immo-accent-blue" />} />
        <KPICard label="Erreurs (total)" value={data.errorCount} accent={data.errorCount > 0 ? 'red' : 'green'} icon={<AlertTriangle className="h-5 w-5 text-immo-status-red" />} />
        <KPICard label="Erreurs (24h)" value={data.errors24h.length} accent={data.errors24h.length > 0 ? 'red' : 'green'} icon={<Zap className="h-5 w-5 text-immo-status-orange" />} />
        <KPICard label="Taux erreur" value={`${data.errorRate.toFixed(1)}%`} accent={healthColor} icon={<Cpu className="h-5 w-5 text-[#7C3AED]" />} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-immo-border-default">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${tab === t.key ? 'border-[#7C3AED] text-[#7C3AED]' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Hourly activity chart */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Activite par heure (24h)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.hourlyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
                <XAxis dataKey="hour" tick={CHART_STYLE} interval={3} />
                <YAxis tick={CHART_STYLE} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="actions" name="Actions" fill="#0579DA" radius={[2, 2, 0, 0]} />
                <Bar dataKey="errors" name="Erreurs" fill="#CD3D64" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* 7-day trend + errors list */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Tendance 7 jours</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={data.dailyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
                  <XAxis dataKey="day" tick={CHART_STYLE} />
                  <YAxis tick={CHART_STYLE} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8, fontSize: 11 }} />
                  <Line type="monotone" dataKey="actions" stroke="#7C3AED" strokeWidth={2} dot={{ fill: '#7C3AED', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Errors list */}
            <Card noPadding>
              <div className="border-b border-immo-border-default px-5 py-3">
                <h3 className="text-sm font-semibold text-immo-status-red">Erreurs recentes ({data.errors24h.length})</h3>
              </div>
              <div className="max-h-[200px] divide-y divide-immo-border-default overflow-y-auto">
                {data.errors24h.length === 0 && <p className="px-5 py-4 text-center text-xs text-immo-text-muted">Aucune erreur</p>}
                {data.errors24h.map((e, i) => (
                  <div key={i} className="px-5 py-2">
                    <p className="text-xs text-immo-status-red">{(e.details as Record<string, string>)?.message ?? 'Erreur inconnue'}</p>
                    <p className="text-[10px] text-immo-text-muted">{format(new Date(e.created_at), 'dd/MM HH:mm:ss')}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Action frequency + recent logs */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card noPadding>
              <div className="border-b border-immo-border-default px-5 py-3"><h3 className="text-sm font-semibold text-immo-text-primary">Actions frequentes</h3></div>
              <div className="divide-y divide-immo-border-default">
                {data.functionStats.map(s => (
                  <div key={s.action} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-xs text-immo-text-primary">{s.action}</span>
                    <StatusBadge label={String(s.count)} type="blue" />
                  </div>
                ))}
              </div>
            </Card>
            <Card noPadding>
              <div className="border-b border-immo-border-default px-5 py-3"><h3 className="text-sm font-semibold text-immo-text-primary">Logs recents</h3></div>
              <div className="max-h-[350px] divide-y divide-immo-border-default overflow-y-auto">
                {data.recentLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-2">
                    <div className={`h-1.5 w-1.5 rounded-full ${log.action === 'error' ? 'bg-immo-status-red' : 'bg-immo-accent-green'}`} />
                    <span className="flex-1 text-xs text-immo-text-primary">{log.action}</span>
                    <span className="text-[10px] text-immo-text-muted">{format(new Date(log.created_at), 'dd/MM HH:mm')}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Security tab */}
      {tab === 'security' && (
        <div className="space-y-6">
          <Card noPadding>
            <div className="border-b border-immo-border-default px-5 py-3">
              <h3 className="text-sm font-semibold text-immo-text-primary">Dernières connexions super admin</h3>
            </div>
            <div className="divide-y divide-immo-border-default">
              {data.loginLogs.length === 0 && <p className="px-5 py-6 text-center text-xs text-immo-text-muted">Aucune connexion enregistree</p>}
              {data.loginLogs.map((log, i) => {
                const details = log.details as Record<string, string> | null
                return (
                  <div key={i} className="flex items-center gap-4 px-5 py-3">
                    <Shield className="h-4 w-4 shrink-0 text-immo-accent-green" />
                    <div className="flex-1">
                      <p className="text-xs text-immo-text-primary">Connexion super admin</p>
                      <p className="text-[10px] text-immo-text-muted">
                        IP: {details?.ip ?? 'N/A'} · {details?.user_agent ? details.user_agent.slice(0, 60) + '...' : 'N/A'}
                      </p>
                    </div>
                    <span className="text-[10px] text-immo-text-muted">{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Failed actions (errors as potential security events) */}
          <Card noPadding>
            <div className="border-b border-immo-border-default px-5 py-3">
              <h3 className="text-sm font-semibold text-immo-text-primary">Evenements de securite</h3>
            </div>
            <div className="max-h-[400px] divide-y divide-immo-border-default overflow-y-auto">
              {data.recentLogs.filter(l => ['error', 'toggle_maintenance', 'change_plan', 'create_user'].includes(l.action)).map((log, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <div className={`h-2 w-2 rounded-full ${log.action === 'error' ? 'bg-immo-status-red' : log.action === 'toggle_maintenance' ? 'bg-immo-status-orange' : 'bg-immo-accent-blue'}`} />
                  <div className="flex-1">
                    <p className="text-xs text-immo-text-primary">{log.action}</p>
                    {log.details && <p className="text-[10px] text-immo-text-muted">{JSON.stringify(log.details).slice(0, 80)}</p>}
                  </div>
                  <span className="text-[10px] text-immo-text-muted">{format(new Date(log.created_at), 'dd/MM HH:mm')}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Usage tab */}
      {tab === 'usage' && (
        <div className="space-y-6">
          <Card noPadding className="overflow-hidden">
            <div className="border-b border-immo-border-default px-5 py-3">
              <h3 className="text-sm font-semibold text-immo-text-primary">Consommation par tenant</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-immo-border-default bg-immo-bg-primary">
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-immo-text-muted">Tenant ID</th>
                    <th className="px-4 py-2 text-right text-[11px] font-medium text-immo-text-muted">API Calls</th>
                    <th className="px-4 py-2 text-right text-[11px] font-medium text-immo-text-muted">Stockage (MB)</th>
                    <th className="px-4 py-2 text-right text-[11px] font-medium text-immo-text-muted">Tokens IA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-immo-border-default">
                  {data.tenantUsage.sort((a, b) => b.api_calls_count - a.api_calls_count).map(t => (
                    <tr key={t.tenant_id} className="hover:bg-immo-bg-card-hover">
                      <td className="px-4 py-2 font-mono text-xs text-immo-text-primary">{t.tenant_id.slice(0, 8)}...</td>
                      <td className="px-4 py-2 text-right text-xs text-immo-text-primary">{t.api_calls_count.toLocaleString('fr')}</td>
                      <td className="px-4 py-2 text-right text-xs text-immo-text-primary">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-immo-border-default">
                            <div className="h-full rounded-full bg-immo-accent-blue" style={{ width: `${Math.min(100, (t.storage_used_mb / 500) * 100)}%` }} />
                          </div>
                          {t.storage_used_mb}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-immo-text-primary">{t.ai_tokens_used.toLocaleString('fr')}</td>
                    </tr>
                  ))}
                  {data.tenantUsage.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-immo-text-muted">Aucune donnee</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
