import { useMemo } from 'react'
import { Bot, Mail, MessageCircle, Database, TrendingUp, TrendingDown } from 'lucide-react'
import { Card } from '@/components/common'

const RATE_ANTHROPIC_DA_PER_CALL = 0.5
const RATE_RESEND_DA_PER_EMAIL = 0.06
const RATE_WHATSAPP_DA_PER_MESSAGE = 1
const SUPABASE_FIXED_DA_MONTHLY = 3500

const PLAN_COLORS: Record<string, string> = {
  free: '#8898AA',
  starter: '#0579DA',
  pro: '#0579DA',
  enterprise: '#F5A623',
}

function formatPrice(da: number): string {
  if (da === 0) return 'Gratuit'
  return `${da.toLocaleString('fr-FR')} DA`
}

interface EconomicsRow {
  plan: string
  revenueMonthly: number
  costAnthropicMax: number
  costResendMax: number
  costWhatsappMax: number
  costSupabase: number
  costsTotal: number
  profitMax: number
  marginPct: number
  breakevenPct: number
  viable: boolean
}

interface Props {
  editPlans: Array<{
    plan: string
    price_monthly: number
    quota_ai_calls_monthly?: number
    quota_emails_monthly?: number
    quota_whatsapp_messages_monthly?: number
    setup_fee_dzd?: number
  }>
  tenantCounts: Map<string, number>
}

export function EconomicsSimulator({ editPlans, tenantCounts }: Props) {
  const economicsByPlan: EconomicsRow[] = useMemo(() => {
    const activeTenantsTotal = Math.max(1, Array.from(tenantCounts.values()).reduce((a, b) => a + b, 0))
    const supabaseSharePerTenant = SUPABASE_FIXED_DA_MONTHLY / activeTenantsTotal

    return editPlans.map(p => {
      const aiCap = p.quota_ai_calls_monthly ?? 0
      const emailCap = p.quota_emails_monthly ?? 0
      const waCap = p.quota_whatsapp_messages_monthly ?? 0
      const setup = p.setup_fee_dzd ?? 0

      const aiUnits = aiCap === -1 ? 2000 : aiCap
      const emailUnits = emailCap === -1 ? 50000 : emailCap
      const waUnits = waCap === -1 ? 30000 : waCap

      const revenueMonthly = p.price_monthly + setup / 12

      const costAnthropicMax = aiUnits * RATE_ANTHROPIC_DA_PER_CALL
      const costResendMax = emailUnits * RATE_RESEND_DA_PER_EMAIL
      const costWhatsappMax = waUnits * RATE_WHATSAPP_DA_PER_MESSAGE
      const costsVariableMax = costAnthropicMax + costResendMax + costWhatsappMax
      const costsTotal = costsVariableMax + supabaseSharePerTenant

      const profitMax = revenueMonthly - costsTotal
      const marginPct = revenueMonthly > 0 ? (profitMax / revenueMonthly) * 100 : 0

      const breakevenPct = costsVariableMax > 0
        ? ((revenueMonthly - supabaseSharePerTenant) / costsVariableMax) * 100
        : (revenueMonthly >= supabaseSharePerTenant ? Infinity : 0)

      return {
        plan: p.plan,
        revenueMonthly,
        costAnthropicMax,
        costResendMax,
        costWhatsappMax,
        costSupabase: supabaseSharePerTenant,
        costsTotal,
        profitMax,
        marginPct,
        breakevenPct,
        viable: profitMax > 0,
      }
    })
  }, [editPlans, tenantCounts])

  return (
    <Card noPadding className="overflow-hidden">
      <div className="border-b border-immo-border-default bg-[#0579DA]/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#0579DA]" />
          <h3 className="text-sm font-semibold text-immo-text-primary">Simulateur économique — coût d'1 tenant à 100% des quotas</h3>
        </div>
        <p className="mt-1 text-[11px] text-immo-text-muted">
          Recalcul en direct selon vos modifications.
          Tarifs sourcés depuis les Edge Functions
          (Anthropic ~{RATE_ANTHROPIC_DA_PER_CALL} DA/appel, Resend {RATE_RESEND_DA_PER_EMAIL} DA/mail, WhatsApp {RATE_WHATSAPP_DA_PER_MESSAGE} DA/msg).
          Quote-part Supabase = {SUPABASE_FIXED_DA_MONTHLY} DA / nb tenants actifs.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-immo-border-default bg-immo-bg-primary text-[10px] uppercase tracking-wide text-immo-text-muted">
              <th className="px-4 py-2 text-start font-semibold">Plan</th>
              <th className="px-4 py-2 text-end font-semibold">Revenu</th>
              <th className="px-4 py-2 text-end font-semibold"><Bot className="me-0.5 inline h-3 w-3" /> IA</th>
              <th className="px-4 py-2 text-end font-semibold"><Mail className="me-0.5 inline h-3 w-3" /> Emails</th>
              <th className="px-4 py-2 text-end font-semibold"><MessageCircle className="me-0.5 inline h-3 w-3" /> WhatsApp</th>
              <th className="px-4 py-2 text-end font-semibold"><Database className="me-0.5 inline h-3 w-3" /> Supabase</th>
              <th className="px-4 py-2 text-end font-semibold">Coût total</th>
              <th className="px-4 py-2 text-end font-semibold">Profit max</th>
              <th className="px-4 py-2 text-end font-semibold">Marge</th>
              <th className="px-4 py-2 text-end font-semibold">Rupture</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-immo-border-default">
            {economicsByPlan.map(eco => {
              const profitColor = eco.profitMax >= 0 ? 'text-immo-accent-green' : 'text-immo-status-red'
              const marginColor = eco.marginPct >= 50 ? 'text-immo-accent-green' : eco.marginPct >= 20 ? 'text-immo-status-orange' : 'text-immo-status-red'
              return (
                <tr key={eco.plan} className="hover:bg-immo-bg-primary/40">
                  <td className="px-4 py-2 font-bold capitalize" style={{ color: PLAN_COLORS[eco.plan] ?? '#0579DA' }}>{eco.plan}</td>
                  <td className="px-4 py-2 text-end text-immo-text-primary">{formatPrice(eco.revenueMonthly)}</td>
                  <td className="px-4 py-2 text-end text-immo-text-secondary">−{Math.round(eco.costAnthropicMax).toLocaleString('fr-FR')} DA</td>
                  <td className="px-4 py-2 text-end text-immo-text-secondary">−{Math.round(eco.costResendMax).toLocaleString('fr-FR')} DA</td>
                  <td className="px-4 py-2 text-end text-immo-text-secondary">−{Math.round(eco.costWhatsappMax).toLocaleString('fr-FR')} DA</td>
                  <td className="px-4 py-2 text-end text-immo-text-secondary">−{Math.round(eco.costSupabase).toLocaleString('fr-FR')} DA</td>
                  <td className="px-4 py-2 text-end font-medium text-immo-status-red">−{Math.round(eco.costsTotal).toLocaleString('fr-FR')} DA</td>
                  <td className={`px-4 py-2 text-end font-bold ${profitColor}`}>
                    {eco.profitMax >= 0
                      ? <TrendingUp className="me-0.5 inline h-3 w-3" />
                      : <TrendingDown className="me-0.5 inline h-3 w-3" />}
                    {eco.profitMax >= 0 ? '+' : ''}{Math.round(eco.profitMax).toLocaleString('fr-FR')} DA
                  </td>
                  <td className={`px-4 py-2 text-end font-semibold ${marginColor}`}>{eco.marginPct.toFixed(0)}%</td>
                  <td className="px-4 py-2 text-end text-[11px] text-immo-text-muted">
                    {eco.breakevenPct === Infinity ? '∞' : `${Math.max(0, eco.breakevenPct).toFixed(0)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {economicsByPlan.some(e => !e.viable && e.revenueMonthly > 0) && (
        <div className="border-t border-immo-status-red/30 bg-immo-status-red/5 px-5 py-3">
          <p className="text-xs font-medium text-immo-status-red">
            ⚠️ Au moins un plan est <strong>non viable à 100% d'utilisation</strong>.
            Augmente le prix ou baisse les quotas pour qu'il dégage du profit.
          </p>
        </div>
      )}
    </Card>
  )
}
