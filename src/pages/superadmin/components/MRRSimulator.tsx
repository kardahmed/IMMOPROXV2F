import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Calculator } from 'lucide-react'
import { Card } from '@/components/common'
import { Input } from '@/components/ui/input'
import type { PlanRow } from './PlanCard'

interface Props {
  editPlans: PlanRow[]
  tenantCounts: Map<string, number>
}

// "If I sell N tenants on each plan, what's my MRR / cost / profit?"
// Founder uses this to set pricing. Each plan row gets an editable
// projection input; the row totals + grand total update live.
//
// All values are in DA. Feature costs come from
// plan_limits.estimated_cost_da_monthly which is recomputed by the
// recompute_plan_costs() RPC after any plan/feature edit.
export function MRRSimulator({ editPlans, tenantCounts }: Props) {
  // Default each projection to "current count + 5" so the founder sees
  // the immediate "what if I add 5 tenants per plan" picture. Editable.
  const [projections, setProjections] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const p of editPlans) {
      init[p.plan] = (tenantCounts.get(p.plan) ?? 0) + 5
    }
    return init
  })

  // Sync projections when plans list changes (added/deleted plan)
  if (editPlans.some(p => projections[p.plan] === undefined)) {
    const next = { ...projections }
    for (const p of editPlans) {
      if (next[p.plan] === undefined) next[p.plan] = (tenantCounts.get(p.plan) ?? 0) + 5
    }
    setProjections(next)
  }

  const rows = useMemo(() => {
    return editPlans.map(p => {
      const tenants = projections[p.plan] ?? 0
      const revenue = tenants * (p.price_monthly ?? 0)
      const cost = tenants * (p.estimated_cost_da_monthly ?? 0)
      const profit = revenue - cost
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0
      return { plan: p.plan, label_fr: p.label_fr ?? p.plan, tenants, revenue, cost, profit, margin }
    })
  }, [editPlans, projections])

  const totals = useMemo(() => {
    const tenants = rows.reduce((s, r) => s + r.tenants, 0)
    const revenue = rows.reduce((s, r) => s + r.revenue, 0)
    const cost = rows.reduce((s, r) => s + r.cost, 0)
    const profit = revenue - cost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
    return { tenants, revenue, cost, profit, margin }
  }, [rows])

  function setProj(slug: string, value: number) {
    setProjections(prev => ({ ...prev, [slug]: Math.max(0, Math.min(10000, value || 0)) }))
  }

  function fmt(da: number) {
    return Math.round(da).toLocaleString('fr-FR') + ' DA'
  }

  const monthlyToYearly = (da: number) => da * 12

  return (
    <Card noPadding className="overflow-hidden">
      <div className="border-b border-immo-border-default bg-[#0579DA]/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-[#0579DA]" />
          <h3 className="text-sm font-semibold text-immo-text-primary">Simulateur MRR — projection de signatures</h3>
        </div>
        <p className="mt-1 text-[11px] text-immo-text-muted">
          Entrez le nombre de tenants projeté par plan. MRR + coûts + profit recalculés en direct.
          Coûts par tenant lus depuis <code>plan_limits.estimated_cost_da_monthly</code>.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-immo-border-default bg-immo-bg-primary text-[10px] uppercase tracking-wide text-immo-text-muted">
              <th className="px-4 py-2 text-left font-semibold">Plan</th>
              <th className="px-4 py-2 text-left font-semibold">Actuel</th>
              <th className="px-4 py-2 text-left font-semibold">Projection</th>
              <th className="px-4 py-2 text-right font-semibold">Prix unitaire</th>
              <th className="px-4 py-2 text-right font-semibold">Coût unitaire</th>
              <th className="px-4 py-2 text-right font-semibold">MRR</th>
              <th className="px-4 py-2 text-right font-semibold">Coût mensuel</th>
              <th className="px-4 py-2 text-right font-semibold">Profit mensuel</th>
              <th className="px-4 py-2 text-right font-semibold">Marge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-immo-border-default">
            {rows.map(r => {
              const plan = editPlans.find(p => p.plan === r.plan)!
              const profitColor = r.profit >= 0 ? 'text-immo-accent-green' : 'text-immo-status-red'
              const marginColor = r.margin >= 60 ? 'text-immo-accent-green' : r.margin >= 30 ? 'text-immo-status-orange' : 'text-immo-status-red'
              return (
                <tr key={r.plan} className="hover:bg-immo-bg-primary/40">
                  <td className="px-4 py-2 font-bold capitalize text-immo-text-primary">{r.label_fr}</td>
                  <td className="px-4 py-2 text-immo-text-muted">{tenantCounts.get(r.plan) ?? 0}</td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      value={r.tenants}
                      onChange={e => setProj(r.plan, parseInt(e.target.value) || 0)}
                      className="h-7 w-[80px] border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary"
                    />
                  </td>
                  <td className="px-4 py-2 text-right text-immo-text-secondary">{fmt(plan.price_monthly)}</td>
                  <td className="px-4 py-2 text-right text-immo-text-secondary">{fmt(plan.estimated_cost_da_monthly ?? 0)}</td>
                  <td className="px-4 py-2 text-right font-medium text-immo-text-primary">{fmt(r.revenue)}</td>
                  <td className="px-4 py-2 text-right text-immo-status-red">−{fmt(r.cost)}</td>
                  <td className={`px-4 py-2 text-right font-bold ${profitColor}`}>
                    {r.profit >= 0
                      ? <TrendingUp className="mr-0.5 inline h-3 w-3" />
                      : <TrendingDown className="mr-0.5 inline h-3 w-3" />}
                    {r.profit >= 0 ? '+' : ''}{fmt(r.profit)}
                  </td>
                  <td className={`px-4 py-2 text-right font-semibold ${marginColor}`}>{r.margin.toFixed(0)}%</td>
                </tr>
              )
            })}
            {/* Totals row */}
            <tr className="bg-immo-bg-primary font-bold">
              <td className="px-4 py-3 text-immo-text-primary" colSpan={2}>TOTAL</td>
              <td className="px-4 py-3 text-immo-accent-green">{totals.tenants} tenants</td>
              <td colSpan={2} />
              <td className="px-4 py-3 text-right text-immo-text-primary">{fmt(totals.revenue)}</td>
              <td className="px-4 py-3 text-right text-immo-status-red">−{fmt(totals.cost)}</td>
              <td className={`px-4 py-3 text-right ${totals.profit >= 0 ? 'text-immo-accent-green' : 'text-immo-status-red'}`}>
                {totals.profit >= 0 ? '+' : ''}{fmt(totals.profit)}
              </td>
              <td className="px-4 py-3 text-right text-immo-accent-green">{totals.margin.toFixed(0)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ARR projection */}
      <div className="border-t border-immo-border-default bg-immo-accent-green/5 px-5 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-immo-text-primary">Projection annuelle (×12)</span>
          <div className="flex items-center gap-6 text-xs">
            <span className="text-immo-text-secondary">
              ARR : <strong className="text-immo-text-primary">{fmt(monthlyToYearly(totals.revenue))}</strong>
            </span>
            <span className="text-immo-text-secondary">
              Coûts annuels : <strong className="text-immo-status-red">−{fmt(monthlyToYearly(totals.cost))}</strong>
            </span>
            <span className={`font-semibold ${totals.profit >= 0 ? 'text-immo-accent-green' : 'text-immo-status-red'}`}>
              Profit annuel : {totals.profit >= 0 ? '+' : ''}{fmt(monthlyToYearly(totals.profit))}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
