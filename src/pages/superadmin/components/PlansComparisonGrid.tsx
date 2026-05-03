import { Check, X } from 'lucide-react'
import { Card } from '@/components/common'
import { type PlanRow } from './PlanCard'
import type { CatalogFeature } from '@/hooks/useFeatureCatalog'

const PLAN_COLORS: Record<string, string> = {
  free: '#8898AA',
  starter: '#0579DA',
  pro: '#0579DA',
  enterprise: '#F5A623',
}

function formatTokens(tokens: number): string {
  if (tokens === -1) return 'Illimite'
  if (tokens === 0) return 'Aucun'
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
  return String(tokens)
}

function formatPrice(da: number): string {
  if (da === 0) return 'Gratuit'
  return `${da.toLocaleString('fr-FR')} DA`
}

interface Props {
  editPlans: PlanRow[]
  tenantCounts: Map<string, number>
  catalog: CatalogFeature[]
}

export function PlansComparisonGrid({ editPlans, tenantCounts, catalog }: Props) {
  return (
    <Card noPadding className="overflow-hidden">
      <div className="border-b border-immo-border-default px-5 py-3">
        <h3 className="text-sm font-semibold text-immo-text-primary">Grille comparative</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-immo-border-default bg-immo-bg-primary">
              <th className="px-4 py-2 text-left text-[11px] font-medium text-immo-text-muted">Critere</th>
              {editPlans.map(p => (
                <th key={p.plan} className="px-4 py-2 text-center text-[11px] font-bold capitalize" style={{ color: PLAN_COLORS[p.plan] ?? '#0579DA' }}>
                  {p.plan}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-immo-border-default">
            <tr>
              <td className="px-4 py-2 text-immo-text-secondary">Prix</td>
              {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center font-medium text-immo-text-primary">{formatPrice(p.price_monthly)}</td>)}
            </tr>
            <tr>
              <td className="px-4 py-2 text-immo-text-secondary">Agents</td>
              {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_agents >= 999 ? '∞' : p.max_agents}</td>)}
            </tr>
            <tr>
              <td className="px-4 py-2 text-immo-text-secondary">Projets</td>
              {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_projects >= 999 ? '∞' : p.max_projects}</td>)}
            </tr>
            <tr>
              <td className="px-4 py-2 text-immo-text-secondary">Unites</td>
              {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_units >= 9999 ? '∞' : p.max_units}</td>)}
            </tr>
            <tr>
              <td className="px-4 py-2 text-immo-text-secondary">Clients</td>
              {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_clients >= 9999 ? '∞' : p.max_clients}</td>)}
            </tr>
            <tr>
              <td className="px-4 py-2 text-immo-text-secondary">Stockage</td>
              {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_storage_mb >= 10000 ? '∞' : `${p.max_storage_mb} MB`}</td>)}
            </tr>
            <tr className="bg-[#0579DA]/5">
              <td className="px-4 py-2 font-medium text-[#0579DA]">Tokens IA / mois</td>
              {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center font-semibold text-[#0579DA]">{formatTokens(p.max_ai_tokens_monthly)}</td>)}
            </tr>
            {catalog.map(f => (
              <tr key={f.slug} className={!f.is_implemented ? 'opacity-40' : ''}>
                <td className="px-4 py-2 text-immo-text-secondary">
                  {f.label_fr}
                  {!f.is_implemented && <span className="ml-2 text-[9px] uppercase text-immo-text-muted">À venir</span>}
                </td>
                {editPlans.map(p => (
                  <td key={p.plan} className="px-4 py-2 text-center">
                    {p.features[f.slug] ? <Check className="mx-auto h-4 w-4 text-immo-accent-green" /> : <X className="mx-auto h-4 w-4 text-immo-text-muted/40" />}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-immo-bg-primary">
              <td className="px-4 py-2 font-medium text-immo-text-primary">Tenants actifs</td>
              {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center font-bold text-immo-text-primary">{tenantCounts.get(p.plan) ?? 0}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  )
}
