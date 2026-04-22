import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Users, DollarSign, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, KPICard } from '@/components/common'
import { formatPriceCompact } from '@/lib/constants'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays } from 'date-fns'

export function RealtimeDashboard() {
  const { data } = useQuery({
    queryKey: ['super-admin-realtime'],
    queryFn: async () => {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const thirtyDaysAgo = subDays(now, 30).toISOString()

      const [leadsToday, salesToday, visitsToday, totalRevenue, trend] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', today),
        supabase.from('sales').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', today),
        supabase.from('visits').select('id', { count: 'exact', head: true }).gte('scheduled_at', today),
        supabase.from('sales').select('final_price').eq('status', 'active'),
        supabase.from('clients').select('created_at').gte('created_at', thirtyDaysAgo),
      ])

      const revenue = (totalRevenue.data ?? []).reduce((s, r) => s + ((r as { final_price: number }).final_price ?? 0), 0)

      // Build 30-day trend
      const trendData: Array<{ date: string; leads: number }> = []
      for (let i = 29; i >= 0; i--) {
        const day = format(subDays(now, i), 'yyyy-MM-dd')
        const count = (trend.data ?? []).filter(c => (c.created_at as string).startsWith(day)).length
        trendData.push({ date: format(subDays(now, i), 'dd/MM'), leads: count })
      }

      return {
        leadsToday: leadsToday.count ?? 0,
        salesToday: salesToday.count ?? 0,
        visitsToday: visitsToday.count ?? 0,
        totalRevenue: revenue,
        trendData,
      }
    },
    refetchInterval: 30_000,
  })

  if (!data) return null

  return (
    <div className="space-y-4">
      {/* Realtime KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPICard label="Leads aujourd'hui" value={data.leadsToday} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Ventes aujourd'hui" value={data.salesToday} accent="green" icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="Visites aujourd'hui" value={data.visitsToday} accent="orange" icon={<Calendar className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label="CA total plateforme" value={formatPriceCompact(data.totalRevenue)} accent="green" icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      {/* 30-day trend */}
      <Card className="p-4">
        <h3 className="mb-3 text-xs font-semibold text-immo-text-primary">Leads captures — 30 derniers jours</h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data.trendData}>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#8898AA' }} interval={6} />
            <YAxis tick={{ fontSize: 9, fill: '#8898AA' }} width={25} />
            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="leads" fill="#0579DA" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
