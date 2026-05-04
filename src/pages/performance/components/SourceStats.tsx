import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { SOURCE_LABELS } from '@/types'
import type { ClientSource } from '@/types'

interface Client {
  id: string
  source: string
  pipeline_stage: string
}

const COLORS = ['#0579DA', '#0579DA', '#F5A623', '#00D4A0', '#CD3D64', '#06B6D4', '#388bfd', '#EAB308', '#EC4899', '#8898AA']
const SALE_STAGES = ['vente']
const CONVERSION_STAGES = ['reservation', 'vente']

interface Props {
  clients: Client[]
}

export function SourceStats({ clients }: Props) {
  const stats = useMemo(() => {
    const bySource = new Map<string, { total: number; conversions: number; sales: number }>()

    for (const c of clients) {
      const src = c.source || 'autre'
      const prev = bySource.get(src) ?? { total: 0, conversions: 0, sales: 0 }
      prev.total++
      if (CONVERSION_STAGES.includes(c.pipeline_stage)) prev.conversions++
      if (SALE_STAGES.includes(c.pipeline_stage)) prev.sales++
      bySource.set(src, prev)
    }

    return Array.from(bySource.entries())
      .map(([source, data]) => ({
        source,
        label: SOURCE_LABELS[source as ClientSource] ?? source,
        ...data,
        conversionRate: data.total > 0 ? Math.round((data.conversions / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [clients])

  const pieData = stats.map(s => ({ name: s.label, value: s.total }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Pie chart */}
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Leads par source</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {stats.map((s, i) => (
              <div key={s.source} className="flex items-center gap-1 text-[10px] text-immo-text-secondary">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {s.label} ({s.total})
              </div>
            ))}
          </div>
        </div>

        {/* Conversion by source */}
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Taux de conversion par source</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.slice(0, 6)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#8898AA' }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: '#8898AA' }} width={100} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E3E8EF', borderRadius: 8, fontSize: 11 }} formatter={(v: unknown) => [`${v}%`, 'Conversion']} />
              <Bar dataKey="conversionRate" fill="#0579DA" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail table */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-immo-border-default bg-immo-bg-primary">
              <th className="px-4 py-2 text-start text-[11px] font-medium text-immo-text-muted">Source</th>
              <th className="px-4 py-2 text-end text-[11px] font-medium text-immo-text-muted">Leads</th>
              <th className="px-4 py-2 text-end text-[11px] font-medium text-immo-text-muted">Conversions</th>
              <th className="px-4 py-2 text-end text-[11px] font-medium text-immo-text-muted">Ventes</th>
              <th className="px-4 py-2 text-end text-[11px] font-medium text-immo-text-muted">Taux</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-immo-border-default">
            {stats.map((s, i) => (
              <tr key={s.source} className="hover:bg-immo-bg-card-hover">
                <td className="px-4 py-2 flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-immo-text-primary">{s.label}</span>
                </td>
                <td className="px-4 py-2 text-end text-immo-text-primary">{s.total}</td>
                <td className="px-4 py-2 text-end text-immo-text-primary">{s.conversions}</td>
                <td className="px-4 py-2 text-end font-medium text-immo-accent-green">{s.sales}</td>
                <td className="px-4 py-2 text-end">
                  <span className={`font-medium ${s.conversionRate >= 20 ? 'text-immo-accent-green' : s.conversionRate >= 10 ? 'text-immo-status-orange' : 'text-immo-status-red'}`}>
                    {s.conversionRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
