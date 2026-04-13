import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, Users, Calendar, Home, TrendingUp, Target, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { KPICard, LoadingSpinner } from '@/components/common'
import { formatPriceCompact } from '@/lib/constants'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const SOURCE_LABELS: Record<string, string> = {
  facebook_ads: 'Facebook Ads', google_ads: 'Google Ads', instagram_ads: 'Instagram Ads',
  appel_entrant: 'Appel entrant', reception: 'Reception', bouche_a_oreille: 'Bouche a oreille',
  reference_client: 'Reference', site_web: 'Site web', portail_immobilier: 'Portail', landing_page: 'Landing page', autre: 'Autre',
}

export function AnalyticsTab() {
  const tenantId = useAuthStore(s => s.tenantId)
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year' | 'all'>('year')

  const now = new Date()
  const dateFrom = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1)
    : period === 'quarter' ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    : period === 'year' ? new Date(now.getFullYear(), 0, 1)
    : new Date(2020, 0, 1)
  const dateStr = dateFrom.toISOString().split('T')[0]

  const { data, isLoading } = useQuery({
    queryKey: ['marketing-roi', tenantId, period],
    queryFn: async () => {
      const [expensesRes, clientsRes, visitsRes, reservationsRes, salesRes] = await Promise.all([
        supabase.from('marketing_expenses').select('amount, category, project_id, expense_date').eq('tenant_id', tenantId!).gte('expense_date', dateStr),
        supabase.from('clients').select('id, source, pipeline_stage, created_at').eq('tenant_id', tenantId!).gte('created_at', dateFrom.toISOString()),
        supabase.from('visits').select('id, client_id, status').eq('tenant_id', tenantId!).in('status', ['completed', 'confirmed']).gte('created_at', dateFrom.toISOString()),
        supabase.from('reservations').select('id').eq('tenant_id', tenantId!).gte('created_at', dateFrom.toISOString()),
        supabase.from('sales').select('id, final_price, client_id').eq('tenant_id', tenantId!).eq('status', 'active').gte('created_at', dateFrom.toISOString()),
      ])

      const expenses = (expensesRes.data ?? []) as Array<{ amount: number; category: string; project_id: string | null; expense_date: string }>
      const clients = (clientsRes.data ?? []) as Array<{ id: string; source: string; pipeline_stage: string; created_at: string }>
      const visits = (visitsRes.data ?? []) as Array<{ id: string; client_id: string; status: string }>
      const reservations = (reservationsRes.data ?? []) as Array<{ id: string }>
      const sales = (salesRes.data ?? []) as Array<{ id: string; final_price: number; client_id: string }>

      const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)
      const totalLeads = clients.length
      const totalVisits = visits.length
      const totalReservations = reservations.length
      const totalSales = sales.length
      const totalRevenue = sales.reduce((s, sale) => s + (sale.final_price ?? 0), 0)

      const cpl = totalLeads > 0 ? totalSpent / totalLeads : 0
      const cpv = totalVisits > 0 ? totalSpent / totalVisits : 0
      const cpr = totalReservations > 0 ? totalSpent / totalReservations : 0
      const cpa = totalSales > 0 ? totalSpent / totalSales : 0
      const roi = totalSpent > 0 ? ((totalRevenue - totalSpent) / totalSpent) * 100 : 0
      const avgDealValue = totalSales > 0 ? totalRevenue / totalSales : 0

      // By source
      const sources = new Map<string, { leads: number; visits: number; sales: number; revenue: number }>()
      for (const c of clients) {
        const src = c.source ?? 'autre'
        if (!sources.has(src)) sources.set(src, { leads: 0, visits: 0, sales: 0, revenue: 0 })
        sources.get(src)!.leads++
      }
      const clientIdSet = new Map(clients.map(c => [c.id, c.source ?? 'autre']))
      for (const v of visits) {
        const src = clientIdSet.get(v.client_id)
        if (src && sources.has(src)) sources.get(src)!.visits++
      }
      for (const s of sales) {
        const src = clientIdSet.get(s.client_id)
        if (src && sources.has(src)) { sources.get(src)!.sales++; sources.get(src)!.revenue += s.final_price ?? 0 }
      }

      const bySource = [...sources.entries()].map(([source, data]) => ({
        source, label: SOURCE_LABELS[source] ?? source, ...data,
        cpl: totalLeads > 0 ? totalSpent / totalLeads : 0, // Global CPL (no per-source expense tracking)
        conversionRate: data.leads > 0 ? (data.sales / data.leads) * 100 : 0,
      })).sort((a, b) => b.leads - a.leads)

      // Monthly CPL trend
      const cplTrend: Array<{ month: string; cpl: number }> = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']
        const monthExpenses = expenses.filter(ex => ex.expense_date?.startsWith(key)).reduce((s, ex) => s + ex.amount, 0)
        const monthLeads = clients.filter(c => c.created_at.startsWith(key)).length
        cplTrend.push({ month: monthNames[d.getMonth()], cpl: monthLeads > 0 ? monthExpenses / monthLeads : 0 })
      }

      return { totalSpent, totalLeads, totalVisits, totalReservations, totalSales, totalRevenue, cpl, cpv, cpr, cpa, roi, avgDealValue, bySource, cplTrend }
    },
    enabled: !!tenantId,
  })

  if (isLoading || !data) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex gap-1 rounded-lg border border-immo-border-default w-fit">
        {([['month', 'Ce mois'], ['quarter', 'Trimestre'], ['year', 'Annee'], ['all', 'Tout']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`rounded-md px-3 py-1.5 text-[11px] font-medium ${period === k ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted hover:text-immo-text-primary'}`}>{l}</button>
        ))}
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard label="Cout par lead" value={formatPriceCompact(data.cpl) + ' DA'} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Cout par visite" value={formatPriceCompact(data.cpv) + ' DA'} accent="orange" icon={<Calendar className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label="Cout par reservation" value={formatPriceCompact(data.cpr) + ' DA'} accent="blue" icon={<Target className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Cout par vente" value={formatPriceCompact(data.cpa) + ' DA'} accent="green" icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="ROI Marketing" value={`${data.roi.toFixed(0)}%`} accent={data.roi > 0 ? 'green' : 'red'} icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="Valeur moy. vente" value={formatPriceCompact(data.avgDealValue) + ' DA'} accent="green" icon={<Home className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      {/* Funnel */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">Entonnoir marketing</h3>
        <div className="flex items-center justify-between gap-2">
          {[
            { label: 'Depenses', value: formatPriceCompact(data.totalSpent) + ' DA', color: 'text-immo-accent-blue' },
            { label: 'Leads', value: data.totalLeads, color: 'text-immo-accent-blue' },
            { label: 'Visites', value: data.totalVisits, color: 'text-immo-status-orange' },
            { label: 'Reservations', value: data.totalReservations, color: 'text-purple-500' },
            { label: 'Ventes', value: data.totalSales, color: 'text-immo-accent-green' },
            { label: 'CA genere', value: formatPriceCompact(data.totalRevenue) + ' DA', color: 'text-immo-accent-green' },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="text-center">
                <p className={`text-lg font-black ${step.color}`}>{step.value}</p>
                <p className="text-[10px] text-immo-text-muted">{step.label}</p>
              </div>
              {i < arr.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-immo-text-muted/30" />}
            </div>
          ))}
        </div>
      </div>

      {/* By source table */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
        <div className="border-b border-immo-border-default px-5 py-4">
          <h3 className="text-sm font-semibold text-immo-text-primary">Performance par source</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-immo-bg-card-hover">
              {['Source', 'Leads', 'Visites', 'Ventes', 'CA', 'Taux conversion', 'CPL estime'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase text-immo-text-muted">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-immo-border-default">
              {data.bySource.map(s => (
                <tr key={s.source} className="bg-immo-bg-card hover:bg-immo-bg-card-hover">
                  <td className="px-4 py-3 text-sm font-medium text-immo-text-primary">{s.label}</td>
                  <td className="px-4 py-3 text-sm text-immo-accent-blue font-semibold">{s.leads}</td>
                  <td className="px-4 py-3 text-sm text-immo-text-secondary">{s.visits}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-immo-accent-green">{s.sales}</td>
                  <td className="px-4 py-3 text-sm text-immo-text-primary">{formatPriceCompact(s.revenue)} DA</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-immo-bg-primary">
                        <div className="h-full rounded-full bg-immo-accent-green" style={{ width: `${Math.min(s.conversionRate, 100)}%` }} />
                      </div>
                      <span className="text-[11px] font-semibold text-immo-text-secondary">{s.conversionRate.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-immo-text-muted">{s.cpl > 0 ? formatPriceCompact(s.cpl) + ' DA' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.bySource.length === 0 && <div className="py-12 text-center text-sm text-immo-text-muted">Aucune donnee</div>}
        </div>
      </div>

      {/* CPL trend */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Evolution du cout par lead — 6 mois</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.cplTrend}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--immo-text-muted, #8898AA)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--immo-text-muted, #8898AA)' }} width={50} tickFormatter={v => formatPriceCompact(v as number)} />
            <Tooltip contentStyle={{ background: 'var(--immo-bg-card, #fff)', border: '1px solid var(--immo-border-default, #E3E8EF)', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="cpl" fill="var(--immo-accent-green, #0579DA)" radius={[4, 4, 0, 0]} name="CPL (DA)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
