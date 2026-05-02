import { Users, Building2, Home, Briefcase, HardDrive, Cpu, DollarSign, Check, X, Zap, Trash2, Bot, Mail, MessageCircle } from 'lucide-react'
import { Card } from '@/components/common'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CatalogFeature } from '@/hooks/useFeatureCatalog'

// Lucide icon name string → component. Used to render the icon coming
// from feature_catalog.icon (a TEXT column with the lucide name, not a
// component reference, so the catalog stays JSON-serializable).
const ICONS: Record<string, typeof Cpu> = {
  Users, Building2, Home, Briefcase, HardDrive, Cpu, DollarSign, Zap,
  Bot, Mail, MessageCircle,
}
function iconFor(name: string | null | undefined) {
  return (name && ICONS[name]) || Cpu
}

const PLAN_COLORS: Record<string, string> = {
  free: '#8898AA',
  starter: '#0579DA',
  pro: '#7C3AED',
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

export interface PlanRow {
  plan: string
  max_agents: number
  max_projects: number
  max_units: number
  max_clients: number
  max_storage_mb: number
  max_ai_tokens_monthly: number
  price_monthly: number
  price_yearly: number
  features: Record<string, boolean>
  quota_ai_calls_monthly?: number
  quota_emails_monthly?: number
  quota_whatsapp_messages_monthly?: number
  quota_burst_per_hour?: number
  setup_fee_dzd?: number
  // Added by migration 059 — computed by recompute_plan_costs() RPC.
  estimated_cost_da_monthly?: number
  gross_margin_pct?: number
  is_trial_eligible?: boolean
  sort_order?: number
  label_fr?: string | null
  label_ar?: string | null
}

interface Props {
  plan: PlanRow
  index: number
  count: number
  isProtected: boolean
  catalog: CatalogFeature[]   // from useFeatureCatalog
  onUpdate: (index: number, field: keyof PlanRow, value: unknown) => void
  onToggleFeature: (index: number, feature: string) => void
  onDelete: (plan: string) => void
  isDeleting: boolean
}

export function PlanCard({ plan, index: idx, count, isProtected, catalog, onUpdate, onToggleFeature, onDelete, isDeleting }: Props) {
  const color = PLAN_COLORS[plan.plan] ?? '#0579DA'

  return (
    <Card noPadding className="overflow-hidden">
      <div className="px-4 py-3 border-b border-immo-border-default" style={{ backgroundColor: color + '10' }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold capitalize" style={{ color }}>{plan.plan}</h3>
            <p className="text-[10px] text-immo-text-muted">{count} tenant{count > 1 ? 's' : ''}</p>
          </div>
          {!isProtected && (
            <button
              onClick={() => onDelete(plan.plan)}
              disabled={isDeleting}
              aria-label={`Supprimer le plan ${plan.plan}`}
              className="rounded-lg p-1 text-immo-text-muted transition-colors hover:bg-immo-status-red/10 hover:text-immo-status-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-status-red/40 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <Label className="text-[10px] font-medium text-immo-text-muted flex items-center gap-1"><DollarSign className="h-3 w-3" /> Prix mensuel (DA)</Label>
          <Input type="number" value={plan.price_monthly} onChange={e => onUpdate(idx, 'price_monthly', parseInt(e.target.value) || 0)}
            className="mt-1 h-8 border-immo-border-default bg-immo-bg-primary text-sm text-immo-text-primary" />
          <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatPrice(plan.price_monthly)}</p>
        </div>
        <div>
          <Label className="text-[10px] font-medium text-immo-text-muted flex items-center gap-1"><DollarSign className="h-3 w-3" /> Prix annuel (DA)</Label>
          <Input type="number" value={plan.price_yearly} onChange={e => onUpdate(idx, 'price_yearly', parseInt(e.target.value) || 0)}
            className="mt-1 h-8 border-immo-border-default bg-immo-bg-primary text-sm text-immo-text-primary" />
          <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatPrice(plan.price_yearly)}/an {plan.price_monthly > 0 ? `(${Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100)}% economie)` : ''}</p>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">Limites</p>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Users className="h-3 w-3" /> Max agents</Label>
            <Input type="number" value={plan.max_agents} onChange={e => onUpdate(idx, 'max_agents', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
          </div>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Building2 className="h-3 w-3" /> Max projets</Label>
            <Input type="number" value={plan.max_projects} onChange={e => onUpdate(idx, 'max_projects', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
          </div>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Home className="h-3 w-3" /> Max unites</Label>
            <Input type="number" value={plan.max_units} onChange={e => onUpdate(idx, 'max_units', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
          </div>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Briefcase className="h-3 w-3" /> Max clients</Label>
            <Input type="number" value={plan.max_clients} onChange={e => onUpdate(idx, 'max_clients', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
          </div>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><HardDrive className="h-3 w-3" /> Stockage (MB)</Label>
            <Input type="number" value={plan.max_storage_mb} onChange={e => onUpdate(idx, 'max_storage_mb', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
          </div>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Cpu className="h-3 w-3" /> Tokens IA / mois</Label>
            <Input type="number" value={plan.max_ai_tokens_monthly} onChange={e => onUpdate(idx, 'max_ai_tokens_monthly', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
            <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatTokens(plan.max_ai_tokens_monthly)} {plan.max_ai_tokens_monthly === -1 && '(-1 = illimite)'}</p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-[#7C3AED]/20 bg-[#7C3AED]/5 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7C3AED]">Quotas API mensuels</p>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Bot className="h-3 w-3" /> Appels IA / mois</Label>
            <Input type="number" value={plan.quota_ai_calls_monthly ?? 0} onChange={e => onUpdate(idx, 'quota_ai_calls_monthly', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
            <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatTokens(plan.quota_ai_calls_monthly ?? 0)} {(plan.quota_ai_calls_monthly ?? 0) === -1 && '(illimite)'}</p>
          </div>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Mail className="h-3 w-3" /> Emails / mois</Label>
            <Input type="number" value={plan.quota_emails_monthly ?? 0} onChange={e => onUpdate(idx, 'quota_emails_monthly', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
            <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatTokens(plan.quota_emails_monthly ?? 0)} {(plan.quota_emails_monthly ?? 0) === -1 && '(illimite)'}</p>
          </div>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><MessageCircle className="h-3 w-3" /> WhatsApp / mois</Label>
            <Input type="number" value={plan.quota_whatsapp_messages_monthly ?? 0} onChange={e => onUpdate(idx, 'quota_whatsapp_messages_monthly', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
            <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatTokens(plan.quota_whatsapp_messages_monthly ?? 0)} {(plan.quota_whatsapp_messages_monthly ?? 0) === -1 && '(illimite)'}</p>
          </div>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Zap className="h-3 w-3" /> Burst max / heure</Label>
            <Input type="number" value={plan.quota_burst_per_hour ?? 100} onChange={e => onUpdate(idx, 'quota_burst_per_hour', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
            <p className="mt-0.5 text-[10px] text-immo-text-muted">Anti-loop, tous services confondus</p>
          </div>

          <div>
            <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><DollarSign className="h-3 w-3" /> Frais setup unique (DA)</Label>
            <Input type="number" value={plan.setup_fee_dzd ?? 0} onChange={e => onUpdate(idx, 'setup_fee_dzd', parseInt(e.target.value) || 0)}
              className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
            <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatPrice(plan.setup_fee_dzd ?? 0)}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">Fonctionnalites</p>
          {catalog.map(f => {
            const enabled = plan.features[f.slug] === true
            const Icon = iconFor(f.icon)
            return (
              <button key={f.slug} onClick={() => onToggleFeature(idx, f.slug)}
                title={f.is_implemented ? f.description_fr ?? '' : 'Pas encore implemente'}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                  enabled ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted hover:bg-immo-bg-card-hover'
                } ${!f.is_implemented ? 'opacity-50' : ''}`}>
                {enabled ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                <Icon className="h-3 w-3 shrink-0" />
                <span className="flex-1">{f.label_fr}</span>
                {f.cost_da_monthly_estimated > 0 && (
                  <span className="text-[9px] text-immo-text-muted">~{Math.round(f.cost_da_monthly_estimated)} DA</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
