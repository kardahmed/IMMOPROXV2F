import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatPriceCompact } from '@/lib/constants'

interface Props {
  data: Array<{ month: string; revenue: number }>
}

// Wrapped in its own chunk so recharts (~93kb gzip) is fetched after
// the dashboard KPIs are already on screen, not in parallel with them.
export default function RevenueChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--immo-text-muted, #8898AA)' }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--immo-text-muted, #8898AA)' }} width={50} tickFormatter={v => formatPriceCompact(v)} />
        <Tooltip contentStyle={{ background: 'var(--immo-bg-card, #fff)', border: '1px solid var(--immo-border-default, #E3E8EF)', borderRadius: 8, fontSize: 12 }} formatter={(v) => [formatPriceCompact(v as number) + ' DA', 'CA']} />
        <Bar dataKey="revenue" fill="var(--immo-accent-green, #0579DA)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
