import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp, TrendingDown, Receipt, Bot, Mail, MessageCircle, Database } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { Card, KPICard, PageHeader, PageSkeleton } from '@/components/common'
import { formatPriceCompact, formatPrice } from '@/lib/constants'

const CHART_STYLE = { fontSize: 11, fill: '#7F96B7' }

const SERVICE_META: Record<string, { label: string; icon: typeof Bot; accent: string }> = {
  anthropic: { label: 'Anthropic (IA)', icon: Bot, accent: '#0579DA' },
  resend: { label: 'Resend (Email)', icon: Mail, accent: '#0579DA' },
  whatsapp: { label: 'WhatsApp (Meta)', icon: MessageCircle, accent: '#22C55E' },
  supabase: { label: 'Supabase (fixe)', icon: Database, accent: '#F5A623' },
}

interface CostsSummary {
  period_start: string
  period_end: string
  window_days: number
  revenue_da: number
  costs_by_service: Record<string, number>
  total_costs_da: number
  profit_da: number
  margin_pct: number
  top_tenants: Array<{
    tenant_id: string
    tenant_name: string
    plan: string | null
    cost_da: number
    revenue_da: number
    profit_da: number
  }>
  daily: Array<{ day: string; cost_da: number }>
}

const RANGES = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
] as const

export function CostsPage() {
  const [rangeDays, setRangeDays] = useState<number>(30)

  const { data, isLoading, error } = useQuery({
    queryKey: ['super-admin-costs', rangeDays],
    queryFn: async (): Promise<CostsSummary> => {
      const end = new Date()
      const start = new Date(end.getTime() - rangeDays * 86400_000)
      const { data, error } = await supabase.rpc('get_costs_summary' as never, {
        p_start_date: start.toISOString(),
        p_end_date: end.toISOString(),
      } as never)
      if (error) throw error
      return data as unknown as CostsSummary
    },
  })

  const dailySeries = useMemo(() => {
    if (!data?.daily) return []
    return data.daily.map(d => ({
      day: format(new Date(d.day), 'd MMM', { locale: fr }),
      cost: Number(d.cost_da),
    }))
  }, [data])

  const profitAccent = (data?.profit_da ?? 0) >= 0 ? 'green' : 'red'

  if (isLoading) return <PageSkeleton />

  if (error) {
    return (
      <div>
        <PageHeader title="Coûts & profit" subtitle="Erreur de chargement" />
        <Card>
          <p className="p-6 text-sm text-immo-status-red">
            Impossible de charger les coûts. Vérifiez que la migration 034 a été appliquée et que vous êtes super_admin.
          </p>
        </Card>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <PageHeader title="Coûts & profit" subtitle={`Sur ${data.window_days} jour${data.window_days > 1 ? 's' : ''}`} />

      {/* Range switch */}
      <div className="flex items-center gap-2">
        {RANGES.map(r => (
          <button
            key={r.value}
            onClick={() => setRangeDays(r.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              rangeDays === r.value
                ? 'bg-[#0579DA] text-white'
                : 'bg-immo-bg-card text-immo-text-secondary hover:bg-immo-bg-card-hover'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KPICard
          label="Revenu actif (mensuel)"
          value={formatPriceCompact(data.revenue_da)}
          subtitle="Plans actifs"
          accent="blue"
          icon={<DollarSign className="h-5 w-5 text-immo-accent-blue" />}
        />
        <KPICard
          label="Coûts API (période)"
          value={formatPriceCompact(data.total_costs_da)}
          subtitle={`${data.window_days}j`}
          accent="orange"
          icon={<Receipt className="h-5 w-5 text-immo-status-orange" />}
        />
        <KPICard
          label="Profit"
          value={formatPriceCompact(data.profit_da)}
          subtitle={`Marge ${data.margin_pct}%`}
          accent={profitAccent}
          icon={
            data.profit_da >= 0
              ? <TrendingUp className="h-5 w-5 text-immo-accent-green" />
              : <TrendingDown className="h-5 w-5 text-immo-status-red" />
          }
        />
        <KPICard
          label="Marge"
          value={`${data.margin_pct}%`}
          subtitle={data.margin_pct >= 60 ? 'Saine' : data.margin_pct >= 30 ? 'Acceptable' : 'À surveiller'}
          accent={data.margin_pct >= 60 ? 'green' : data.margin_pct >= 30 ? 'orange' : 'red'}
          icon={<TrendingUp className="h-5 w-5 text-immo-accent-green" />}
        />
      </div>

      {/* Costs by service */}
      <Card>
        <div className="border-b border-immo-border-default/50 px-5 py-3">
          <h3 className="text-sm font-semibold text-immo-text-primary">Coûts par service</h3>
          <p className="mt-0.5 text-xs text-immo-text-muted">Variable + fixe (Supabase pro-raté)</p>
        </div>
        <div className="grid grid-cols-1 gap-px bg-immo-border-default/50 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(SERVICE_META).map(([key, meta]) => {
            const value = data.costs_by_service[key] ?? 0
            const Icon = meta.icon
            const pct = data.total_costs_da > 0 ? (value / data.total_costs_da) * 100 : 0
            return (
              <div key={key} className="bg-immo-bg-card p-5">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${meta.accent}15` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: meta.accent }} />
                  </div>
                  <span className="text-xs font-medium text-immo-text-muted">{meta.label}</span>
                </div>
                <p className="mt-3 text-xl font-bold text-immo-text-primary">{formatPriceCompact(value)}</p>
                <p className="mt-1 text-xs text-immo-text-muted">{pct.toFixed(1)}% des coûts</p>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Daily chart */}
      <Card>
        <div className="border-b border-immo-border-default/50 px-5 py-3">
          <h3 className="text-sm font-semibold text-immo-text-primary">Coûts variables — quotidien</h3>
          <p className="mt-0.5 text-xs text-immo-text-muted">Hors Supabase fixe</p>
        </div>
        <div className="h-72 px-2 py-3">
          {dailySeries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-immo-text-muted">
              Aucune dépense API sur la période. Les coûts s'incrémentent à chaque appel d'edge function.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F5A623" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#F5A623" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E3E8EF" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={CHART_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={CHART_STYLE} axisLine={false} tickLine={false} tickFormatter={v => formatPriceCompact(v)} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8, fontSize: 12 }}
                  formatter={(value) => [formatPrice(Number(value)), 'Coût']}
                />
                <Area type="monotone" dataKey="cost" stroke="#F5A623" strokeWidth={2} fill="url(#costFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Top tenants */}
      <Card>
        <div className="border-b border-immo-border-default/50 px-5 py-3">
          <h3 className="text-sm font-semibold text-immo-text-primary">Top 5 tenants par coût</h3>
          <p className="mt-0.5 text-xs text-immo-text-muted">Profit = Revenu mensuel − Coût API sur la période</p>
        </div>
        {data.top_tenants.length === 0 ? (
          <div className="p-8 text-center text-sm text-immo-text-muted">Aucun tenant actif.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-immo-border-default/50 bg-immo-bg-card-hover/40">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-immo-text-muted">Tenant</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-immo-text-muted">Plan</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-immo-text-muted">Revenu</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-immo-text-muted">Coût API</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-immo-text-muted">Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.top_tenants.map(t => {
                const isProfit = Number(t.profit_da) >= 0
                return (
                  <tr key={t.tenant_id} className="border-b border-immo-border-default/30 last:border-0 hover:bg-immo-bg-card-hover/30">
                    <td className="px-5 py-3 text-sm font-medium text-immo-text-primary">{t.tenant_name}</td>
                    <td className="px-5 py-3 text-sm text-immo-text-secondary">
                      <span className="rounded-md bg-immo-bg-card-hover px-2 py-0.5 text-xs font-medium uppercase">
                        {t.plan ?? 'free'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-sm text-immo-text-primary">{formatPrice(Number(t.revenue_da))}</td>
                    <td className="px-5 py-3 text-right text-sm text-immo-text-secondary">{formatPrice(Number(t.cost_da))}</td>
                    <td className={`px-5 py-3 text-right text-sm font-semibold ${isProfit ? 'text-immo-accent-green' : 'text-immo-status-red'}`}>
                      {isProfit ? '+' : ''}{formatPrice(Number(t.profit_da))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
