import { useQuery } from '@tanstack/react-query'
import { Users, Calendar, DollarSign, Target, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { KPICard, LoadingSpinner } from '@/components/common'
import { formatPriceCompact } from '@/lib/constants'
import { format, isToday, isTomorrow, isAfter } from 'date-fns'
import { fr } from 'date-fns/locale'

export function AgentDashboard() {
  const { t } = useTranslation()
  const userId = useAuthStore(s => s.session?.user?.id)
  const tenantId = useAuthStore(s => s.tenantId)

  const { data, isLoading } = useQuery({
    queryKey: ['agent-dashboard', userId, tenantId],
    queryFn: async () => {
      if (!userId || !tenantId) throw new Error('Missing context')

      const [clientsRes, visitsRes, salesRes, goalsRes] = await Promise.all([
        supabase.from('clients').select('id, full_name, pipeline_stage, last_contact_at, confirmed_budget').eq('tenant_id', tenantId).eq('agent_id', userId),
        supabase.from('visits').select('id, scheduled_at, status, clients(full_name)').eq('agent_id', userId).gte('scheduled_at', new Date().toISOString().split('T')[0]).order('scheduled_at').limit(10),
        supabase.from('sales').select('final_price, created_at').eq('agent_id', userId).eq('status', 'active'),
        supabase.from('agent_goals').select('*').eq('agent_id', userId).limit(1).maybeSingle(),
      ])

      const clients = (clientsRes.data ?? []) as Array<{ id: string; full_name: string; pipeline_stage: string; last_contact_at: string | null; confirmed_budget: number | null }>
      const visits = (visitsRes.data ?? []) as Array<{ id: string; scheduled_at: string; status: string; clients: { full_name: string } | null }>
      const sales = (salesRes.data ?? []) as Array<{ final_price: number; created_at: string }>

      // This month sales
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthSales = sales.filter(s => new Date(s.created_at) >= monthStart)
      const monthRevenue = monthSales.reduce((sum, s) => sum + (s.final_price ?? 0), 0)

      // Clients to relaunch (no contact > 3 days)
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000)
      const toRelaunch = clients.filter(c => {
        if (['vente', 'perdue'].includes(c.pipeline_stage)) return false
        if (!c.last_contact_at) return true
        return new Date(c.last_contact_at) < threeDaysAgo
      }).slice(0, 5)

      // Upcoming visits
      const upcoming = visits.filter(v => v.status !== 'cancelled' && isAfter(new Date(v.scheduled_at), new Date()))

      return {
        totalClients: clients.length,
        todayVisits: upcoming.filter(v => isToday(new Date(v.scheduled_at))).length,
        monthRevenue,
        monthSales: monthSales.length,
        upcoming,
        toRelaunch,
        goalTarget: (goalsRes.data as Record<string, unknown> | null)?.target_sales_count as number ?? null,
      }
    },
    enabled: !!userId && !!tenantId,
  })

  if (isLoading || !data) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label={t('agent_dashboard.my_clients')} value={data.totalClients} accent="blue" icon={<Users className="h-5 w-5 text-immo-accent-blue" />} />
        <KPICard label={t('agent_dashboard.visits_today')} value={data.todayVisits} accent="orange" icon={<Calendar className="h-5 w-5 text-immo-status-orange" />} />
        <KPICard label={t('agent_dashboard.revenue_month')} value={formatPriceCompact(data.monthRevenue)} accent="green" icon={<DollarSign className="h-5 w-5 text-immo-accent-green" />} />
        <KPICard label={t('agent_dashboard.sales_month')} value={data.monthSales} accent="green" subtitle={data.goalTarget ? `Objectif: ${data.goalTarget}` : undefined} icon={<Target className="h-5 w-5 text-immo-accent-green" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming visits */}
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card shadow-sm">
          <div className="border-b border-immo-border-default px-5 py-4">
            <h3 className="text-sm font-semibold text-immo-text-primary">{t('agent_dashboard.next_visits')}</h3>
          </div>
          <div className="max-h-[300px] divide-y divide-immo-border-default overflow-y-auto">
            {data.upcoming.length === 0 ? (
              <div className="py-8 text-center text-sm text-immo-text-muted">{t('agent_dashboard.no_visits')}</div>
            ) : (
              data.upcoming.map(v => {
                const dt = new Date(v.scheduled_at)
                const dayLabel = isToday(dt) ? "Aujourd'hui" : isTomorrow(dt) ? 'Demain' : format(dt, 'EEEE d MMM', { locale: fr })
                return (
                  <div key={v.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-immo-accent-green/10">
                      <span className="text-xs font-bold text-immo-accent-green">{format(dt, 'HH:mm')}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-immo-text-primary">{v.clients?.full_name ?? '-'}</p>
                      <p className="text-[11px] text-immo-text-muted">{dayLabel}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Clients to relaunch */}
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card shadow-sm">
          <div className="border-b border-immo-border-default px-5 py-4">
            <h3 className="text-sm font-semibold text-immo-text-primary">{t('agent_dashboard.clients_relaunch')}</h3>
          </div>
          <div className="max-h-[300px] divide-y divide-immo-border-default overflow-y-auto">
            {data.toRelaunch.length === 0 ? (
              <div className="py-8 text-center text-sm text-immo-text-muted">{t('agent_dashboard.all_caught_up')}</div>
            ) : (
              data.toRelaunch.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <Clock className="h-4 w-4 shrink-0 text-immo-status-orange" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-immo-text-primary">{c.full_name}</p>
                    <p className="text-[11px] text-immo-text-muted">
                      {c.last_contact_at ? t('agent_dashboard.last_contact_on', { date: format(new Date(c.last_contact_at), 'dd/MM') }) : t('agent_dashboard.never_contacted')}
                    </p>
                  </div>
                  {c.confirmed_budget && (
                    <span className="text-xs font-medium text-immo-accent-green">{formatPriceCompact(c.confirmed_budget)}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
