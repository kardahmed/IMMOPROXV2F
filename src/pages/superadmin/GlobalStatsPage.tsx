import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import { DollarSign, TrendingUp, TrendingDown, Users, AlertTriangle, ArrowUpRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { KPICard, LoadingSpinner } from '@/components/common'
import { formatPriceCompact } from '@/lib/constants'
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays } from 'date-fns'

const PLAN_COLORS: Record<string, string> = { free: '#8898AA', starter: '#0579DA', pro: '#7C3AED', enterprise: '#F5A623' }
const CHART_STYLE = { fontSize: 11, fill: '#7F96B7' }

export function GlobalStatsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-global-stats-v2'],
    queryFn: async () => {
      const [tenantsRes, clientsRes, salesRes, invoicesRes, planLimitsRes] = await Promise.all([
        supabase.from('tenants').select('id, name, plan, created_at, suspended_at' as never),
        supabase.from('clients').select('id, tenant_id, created_at'),
        supabase.from('sales').select('id, tenant_id, final_price, created_at').eq('status', 'active'),
        supabase.from('invoices').select('tenant_id, amount, status, period, created_at'),
        supabase.from('plan_limits').select('plan, price_monthly'),
      ])

      const tenants = (tenantsRes.data ?? []) as unknown as Array<{ id: string; name: string; plan: string | null; created_at: string; suspended_at: string | null }>
      const clients = (clientsRes.data ?? []) as Array<{ id: string; tenant_id: string; created_at: string }>
      const sales = (salesRes.data ?? []) as Array<{ id: string; tenant_id: string; final_price: number; created_at: string }>
      const invoices = (invoicesRes.data ?? []) as Array<{ tenant_id: string; amount: number; status: string; period: string; created_at: string }>
      const planPrices = new Map((planLimitsRes.data ?? []).map(p => [(p as { plan: string }).plan, (p as { price_monthly: number }).price_monthly]))

      // ── MRR (Monthly Recurring Revenue) ──
      const activeTenants = tenants.filter(t => !t.suspended_at)
      const mrr = activeTenants.reduce((s, t) => s + (planPrices.get(t.plan ?? 'free') ?? 0), 0)
      const arr = mrr * 12

      // ── MRR by month (last 6 months) ──
      const mrrByMonth: Array<{ month: string; mrr: number; invoiced: number; clients: number; sales: number }> = []
      for (let i = 5; i >= 0; i--) {
        const start = startOfMonth(subMonths(new Date(), i))
        const end = endOfMonth(subMonths(new Date(), i))
        const label = format(start, 'MMM yy')

        // Tenants active at that point
        const activeAtMonth = tenants.filter(t => new Date(t.created_at) <= end && (!t.suspended_at || new Date(t.suspended_at) > start))
        const monthMrr = activeAtMonth.reduce((s, t) => s + (planPrices.get(t.plan ?? 'free') ?? 0), 0)

        // Invoiced revenue
        const monthInvoiced = invoices.filter(inv => {
          const d = new Date(inv.created_at)
          return d >= start && d <= end && inv.status === 'paid'
        }).reduce((s, inv) => s + inv.amount, 0)

        const monthClients = clients.filter(c => { const d = new Date(c.created_at); return d >= start && d <= end }).length
        const monthSales = sales.filter(s => { const d = new Date(s.created_at); return d >= start && d <= end }).length

        mrrByMonth.push({ month: label, mrr: monthMrr, invoiced: monthInvoiced, clients: monthClients, sales: monthSales })
      }

      // ── Churn ──
      const suspendedCount = tenants.filter(t => t.suspended_at).length
      const churnRate = tenants.length > 0 ? (suspendedCount / tenants.length) * 100 : 0

      // ── Revenue by plan ──
      const revenueByPlan = new Map<string, number>()
      for (const t of activeTenants) {
        const plan = t.plan ?? 'free'
        revenueByPlan.set(plan, (revenueByPlan.get(plan) ?? 0) + (planPrices.get(plan) ?? 0))
      }
      const planDistribution = Array.from(revenueByPlan.entries()).map(([plan, revenue]) => ({
        name: plan.charAt(0).toUpperCase() + plan.slice(1),
        value: revenue,
        plan,
        count: activeTenants.filter(t => (t.plan ?? 'free') === plan).length,
      }))

      // ── Tenants by plan ──
      const tenantsByPlan = new Map<string, number>()
      for (const t of tenants) tenantsByPlan.set(t.plan ?? 'free', (tenantsByPlan.get(t.plan ?? 'free') ?? 0) + 1)

      // ── Top 5 by revenue ──
      const revenueByTenant = new Map<string, number>()
      const tenantNames = new Map<string, string>()
      tenants.forEach(t => tenantNames.set(t.id, t.name))
      sales.forEach(s => revenueByTenant.set(s.tenant_id, (revenueByTenant.get(s.tenant_id) ?? 0) + s.final_price))
      const topRevenue = Array.from(revenueByTenant.entries())
        .map(([id, revenue]) => ({ name: tenantNames.get(id) ?? id, revenue }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 5)

      // ── LTV (Lifetime Value) ──
      const avgTenantAge = tenants.length > 0
        ? tenants.reduce((s, t) => s + differenceInDays(new Date(), new Date(t.created_at)), 0) / tenants.length
        : 0
      const avgMonthlyRevenue = tenants.length > 0 ? mrr / tenants.length : 0
      const ltv = avgTenantAge > 0 ? avgMonthlyRevenue * (avgTenantAge / 30) : 0

      // ── Invoice stats ──
      const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0)
      const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
      const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amount, 0)

      return {
        mrr, arr, churnRate, ltv,
        totalTenants: tenants.length, activeTenants: activeTenants.length, suspendedCount,
        totalClients: clients.length, totalSales: sales.length,
        totalInvoiced, totalPaid, totalOverdue,
        mrrByMonth, planDistribution, topRevenue, tenantsByPlan,
      }
    },
  })

  if (isLoading || !data) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-immo-text-primary">Statistiques & Revenus</h1>
        <p className="text-sm text-immo-text-secondary">Dashboard financier de la plateforme</p>
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KPICard label="MRR" value={formatPriceCompact(data.mrr)} accent="green" icon={<DollarSign className="h-5 w-5 text-immo-accent-green" />} />
        <KPICard label="ARR" value={formatPriceCompact(data.arr)} accent="blue" icon={<TrendingUp className="h-5 w-5 text-immo-accent-blue" />} />
        <KPICard label="Churn rate" value={`${data.churnRate.toFixed(1)}%`} accent={data.churnRate > 10 ? 'red' : data.churnRate > 5 ? 'orange' : 'green'} icon={<TrendingDown className="h-5 w-5 text-immo-status-red" />} />
        <KPICard label="LTV moyen" value={formatPriceCompact(data.ltv)} accent="green" icon={<ArrowUpRight className="h-5 w-5 text-immo-accent-green" />} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <KPICard label="Tenants actifs" value={data.activeTenants} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Total clients" value={data.totalClients} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Facture (paye)" value={formatPriceCompact(data.totalPaid)} accent="green" icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="Facture (en retard)" value={formatPriceCompact(data.totalOverdue)} accent={data.totalOverdue > 0 ? 'red' : 'green'} icon={<AlertTriangle className="h-4 w-4 text-immo-status-red" />} />
        <KPICard label="Ventes plateforme" value={data.totalSales} accent="green" icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      {/* Charts row 1: MRR trend + Revenue by plan */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">Evolution MRR & Facturation (6 mois)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.mrrByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
              <XAxis dataKey="month" tick={CHART_STYLE} />
              <YAxis tick={CHART_STYLE} tickFormatter={v => `${Math.round(v / 1000)}K`} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [`${Number(v).toLocaleString('fr')} DA`, '']} />
              <Area type="monotone" dataKey="mrr" name="MRR" stroke="#7C3AED" fill="#7C3AED" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="invoiced" name="Facture" stroke="#0579DA" fill="#0579DA" fillOpacity={0.08} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">Revenus par plan</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.planDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {data.planDistribution.map(entry => (
                  <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] ?? '#8898AA'} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [`${Number(v).toLocaleString('fr')} DA`, '']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1">
            {data.planDistribution.map(p => (
              <div key={p.plan} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PLAN_COLORS[p.plan] ?? '#8898AA' }} />
                  <span className="text-immo-text-secondary">{p.name}</span>
                  <span className="text-immo-text-muted">({p.count})</span>
                </div>
                <span className="font-medium text-immo-text-primary">{p.value.toLocaleString('fr')} DA</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts row 2: Clients + Sales trends */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">Clients captures par mois</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.mrrByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
              <XAxis dataKey="month" tick={CHART_STYLE} />
              <YAxis tick={CHART_STYLE} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8 }} />
              <Bar dataKey="clients" name="Clients" fill="#7C3AED" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">Ventes par mois</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.mrrByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
              <XAxis dataKey="month" tick={CHART_STYLE} />
              <YAxis tick={CHART_STYLE} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8 }} />
              <Line type="monotone" dataKey="sales" name="Ventes" stroke="#00D4A0" strokeWidth={2} dot={{ fill: '#00D4A0', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top tenants */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
        <div className="border-b border-immo-border-default px-5 py-4">
          <h3 className="text-sm font-semibold text-immo-text-primary">Top 5 — Chiffre d'affaires tenants</h3>
        </div>
        <div className="divide-y divide-immo-border-default">
          {data.topRevenue.map((t, i) => (
            <div key={t.name} className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7C3AED]/15 text-xs font-bold text-[#7C3AED]">{i + 1}</span>
              <span className="flex-1 text-sm text-immo-text-primary">{t.name}</span>
              <span className="text-sm font-semibold text-immo-accent-green">{formatPriceCompact(t.revenue)}</span>
            </div>
          ))}
          {data.topRevenue.length === 0 && <div className="py-6 text-center text-sm text-immo-text-secondary">Aucune donnee</div>}
        </div>
      </div>
    </div>
  )
}
