import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/common'
import { formatPriceCompact } from '@/lib/constants'
import { format, subMonths, startOfMonth } from 'date-fns'

export function GlobalStatsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-global-stats'],
    queryFn: async () => {
      // Fetch all tenants with their sales
      const { data: tenants } = await supabase.from('tenants').select('id, name, created_at')
      const { data: clients } = await supabase.from('clients').select('id, tenant_id, created_at')
      const { data: sales } = await supabase.from('sales').select('id, tenant_id, final_price, created_at').eq('status', 'active')

      // Monthly data for last 6 months
      const months: Array<{ month: string; tenants: number; clients: number; sales: number }> = []
      for (let i = 5; i >= 0; i--) {
        const start = startOfMonth(subMonths(new Date(), i))
        const end = startOfMonth(subMonths(new Date(), i - 1))
        const label = format(start, 'MMM yy')
        months.push({
          month: label,
          tenants: (tenants ?? []).filter(t => new Date(t.created_at) >= start && new Date(t.created_at) < end).length,
          clients: (clients ?? []).filter(c => new Date(c.created_at) >= start && new Date(c.created_at) < end).length,
          sales: (sales ?? []).filter(s => new Date(s.created_at) >= start && new Date(s.created_at) < end).length,
        })
      }

      // Top 5 tenants by revenue
      const revenueByTenant = new Map<string, number>()
      const tenantNames = new Map<string, string>()
      ;(tenants ?? []).forEach(t => tenantNames.set(t.id, t.name))
      ;(sales ?? []).forEach(s => {
        const prev = revenueByTenant.get(s.tenant_id) ?? 0
        revenueByTenant.set(s.tenant_id, prev + (s.final_price ?? 0))
      })
      const topRevenue = Array.from(revenueByTenant.entries())
        .map(([id, revenue]) => ({ name: tenantNames.get(id) ?? id, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)

      // Top 5 tenants by clients
      const clientsByTenant = new Map<string, number>()
      ;(clients ?? []).forEach(c => {
        clientsByTenant.set(c.tenant_id, (clientsByTenant.get(c.tenant_id) ?? 0) + 1)
      })
      const topClients = Array.from(clientsByTenant.entries())
        .map(([id, count]) => ({ name: tenantNames.get(id) ?? id, clients: count }))
        .sort((a, b) => b.clients - a.clients)
        .slice(0, 5)

      return { months, topRevenue, topClients }
    },
  })

  if (isLoading || !data) return <LoadingSpinner size="lg" className="h-96" />

  const chartStyle = { fontSize: 11, fill: '#7F96B7' }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Statistiques globales</h1>
        <p className="text-sm text-[#7F96B7]">Vue d'ensemble de la plateforme</p>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Clients per month */}
        <div className="rounded-xl border border-[#1E325A] bg-[#0A1030] p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Clients par mois</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E325A" />
              <XAxis dataKey="month" tick={chartStyle} />
              <YAxis tick={chartStyle} />
              <Tooltip contentStyle={{ background: '#0F1830', border: '1px solid #1E325A', borderRadius: 8, color: '#fff' }} />
              <Bar dataKey="clients" fill="#7C3AED" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sales per month */}
        <div className="rounded-xl border border-[#1E325A] bg-[#0A1030] p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Ventes par mois</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E325A" />
              <XAxis dataKey="month" tick={chartStyle} />
              <YAxis tick={chartStyle} />
              <Tooltip contentStyle={{ background: '#0F1830', border: '1px solid #1E325A', borderRadius: 8, color: '#fff' }} />
              <Line type="monotone" dataKey="sales" stroke="#00D4A0" strokeWidth={2} dot={{ fill: '#00D4A0', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top tables */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Top by revenue */}
        <div className="rounded-xl border border-[#1E325A] bg-[#0A1030]">
          <div className="border-b border-[#1E325A] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Top 5 — Chiffre d'affaires</h3>
          </div>
          <div className="divide-y divide-[#1E325A]">
            {data.topRevenue.map((t, i) => (
              <div key={t.name} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7C3AED]/15 text-xs font-bold text-[#7C3AED]">{i + 1}</span>
                <span className="flex-1 text-sm text-white">{t.name}</span>
                <span className="text-sm font-semibold text-[#00D4A0]">{formatPriceCompact(t.revenue)}</span>
              </div>
            ))}
            {data.topRevenue.length === 0 && <div className="py-6 text-center text-sm text-[#7F96B7]">Aucune donnee</div>}
          </div>
        </div>

        {/* Top by clients */}
        <div className="rounded-xl border border-[#1E325A] bg-[#0A1030]">
          <div className="border-b border-[#1E325A] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Top 5 — Nombre de clients</h3>
          </div>
          <div className="divide-y divide-[#1E325A]">
            {data.topClients.map((t, i) => (
              <div key={t.name} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF9A1E]/15 text-xs font-bold text-[#FF9A1E]">{i + 1}</span>
                <span className="flex-1 text-sm text-white">{t.name}</span>
                <span className="text-sm font-semibold text-white">{t.clients}</span>
              </div>
            ))}
            {data.topClients.length === 0 && <div className="py-6 text-center text-sm text-[#7F96B7]">Aucune donnee</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
