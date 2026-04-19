import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Sparkles, CheckCircle2, Clock, XCircle, MessageCircle, ArrowUpRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { LoadingSpinner } from '@/components/common'
import { Button } from '@/components/ui/button'
import { PaymentRequestModal } from '@/components/billing/PaymentRequestModal'
import { format } from 'date-fns'

type Request = {
  id: string
  plan: string
  billing_cycle: string
  amount_da: number
  method: string
  status: 'pending' | 'awaiting_proof' | 'confirmed' | 'rejected' | 'cancelled'
  created_at: string
  confirmed_at: string | null
  rejection_reason: string | null
}

type SubscriptionPeriod = {
  plan: string
  billing_cycle: string
  amount_da: number
  period_start: string
  period_end: string
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
}

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Virement bancaire',
  ccp: 'Versement CCP',
  cash: 'Especes',
  whatsapp: 'WhatsApp',
  other: 'Autre',
}

const STATUS_STYLES: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'En attente', color: 'orange', icon: Clock },
  awaiting_proof: { label: 'Preuve demandee', color: 'orange', icon: Clock },
  confirmed: { label: 'Confirme', color: 'green', icon: CheckCircle2 },
  rejected: { label: 'Rejete', color: 'red', icon: XCircle },
  cancelled: { label: 'Annule', color: 'muted', icon: XCircle },
}

export function BillingPage() {
  const { tenantId } = useAuthStore()
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [presetPlan, setPresetPlan] = useState<string | undefined>()

  const { data: tenant } = useQuery({
    queryKey: ['current-tenant', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('plan, trial_ends_at, suspended_at').eq('id', tenantId!).single()
      return data as unknown as { plan: string; trial_ends_at: string | null; suspended_at: string | null }
    },
    enabled: !!tenantId,
  })

  const { data: requests = [], isLoading: reqLoading } = useQuery({
    queryKey: ['payment-requests', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('payment_requests').select('*').eq('tenant_id', tenantId!).order('created_at', { ascending: false }).limit(20)
      return (data ?? []) as Request[]
    },
    enabled: !!tenantId,
  })

  const { data: history = [] } = useQuery({
    queryKey: ['subscription-history', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('subscription_history').select('plan, billing_cycle, amount_da, period_start, period_end').eq('tenant_id', tenantId!).order('period_end', { ascending: false }).limit(20)
      return (data ?? []) as SubscriptionPeriod[]
    },
    enabled: !!tenantId,
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['plan-prices-list'],
    queryFn: async () => {
      const { data } = await supabase.from('plan_prices').select('*').eq('active', true).order('display_order')
      return (data ?? []) as Array<{ plan: string; label: string; price_monthly_da: number; price_yearly_da: number; features: string[] }>
    },
  })

  if (!tenant) return <LoadingSpinner size="lg" className="h-96" />

  const currentPlan = tenant.plan
  const trialActive = tenant.trial_ends_at && new Date(tenant.trial_ends_at).getTime() > Date.now()
  const activeSubscription = history.find(h => new Date(h.period_end).getTime() > Date.now())
  const pendingCount = requests.filter(r => r.status === 'pending' || r.status === 'awaiting_proof').length

  function startUpgrade(plan?: string) {
    setPresetPlan(plan)
    setShowUpgrade(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-immo-text-primary">Facturation & abonnement</h1>
          <p className="text-sm text-immo-text-secondary">Gerez votre plan IMMO PRO-X et les paiements</p>
        </div>
        <Button onClick={() => startUpgrade()} className="bg-immo-accent-green text-immo-bg-primary hover:opacity-90">
          <ArrowUpRight className="mr-1.5 h-4 w-4" /> Changer de plan
        </Button>
      </div>

      {/* Current plan card */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-immo-border-default bg-gradient-to-br from-immo-accent-green/10 to-immo-accent-blue/10 p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-immo-accent-green/20">
              <Sparkles className="h-5 w-5 text-immo-accent-green" />
            </div>
            <div>
              <p className="text-xs text-immo-text-muted">Plan actuel</p>
              <p className="text-lg font-bold text-immo-text-primary">{PLAN_LABELS[currentPlan] ?? currentPlan}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {trialActive && (
              <div className="rounded-lg border border-immo-border-default bg-immo-bg-card p-3">
                <p className="text-[11px] text-immo-text-muted">Essai</p>
                <p className="text-sm font-bold text-immo-status-orange">
                  {Math.max(0, Math.ceil((new Date(tenant.trial_ends_at!).getTime() - Date.now()) / 86400000))} jours restants
                </p>
              </div>
            )}
            {activeSubscription && (
              <div className="rounded-lg border border-immo-border-default bg-immo-bg-card p-3">
                <p className="text-[11px] text-immo-text-muted">Renouvellement</p>
                <p className="text-sm font-bold text-immo-text-primary">{format(new Date(activeSubscription.period_end), 'dd/MM/yyyy')}</p>
              </div>
            )}
            {pendingCount > 0 && (
              <div className="rounded-lg border border-immo-status-orange/30 bg-immo-status-orange/10 p-3">
                <p className="text-[11px] text-immo-status-orange">Paiements</p>
                <p className="text-sm font-bold text-immo-status-orange">{pendingCount} en attente</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <h3 className="text-sm font-semibold text-immo-text-primary">Besoin d'aide ?</h3>
          <p className="mt-1 text-xs text-immo-text-secondary">Contactez-nous pour toute question sur la facturation ou un devis Enterprise.</p>
          <a href="https://wa.me/213542766068?text=Bonjour%2C%20question%20facturation" target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-immo-accent-green px-4 py-2 text-xs font-semibold text-immo-bg-primary hover:opacity-90">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        </div>
      </div>

      {/* All plans comparison */}
      <div>
        <h2 className="mb-3 text-base font-bold text-immo-text-primary">Plans disponibles</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {plans.map(p => {
            const isCurrent = p.plan === currentPlan
            return (
              <div key={p.plan}
                className={`relative rounded-xl border-2 p-5 transition-colors ${isCurrent ? 'border-immo-accent-green bg-immo-accent-green/5' : 'border-immo-border-default bg-immo-bg-card'}`}>
                {isCurrent && (
                  <span className="absolute -top-2 right-3 rounded-full bg-immo-accent-green px-2.5 py-0.5 text-[10px] font-bold text-immo-bg-primary">
                    ACTUEL
                  </span>
                )}
                <p className="text-sm font-bold text-immo-text-primary">{p.label}</p>
                <div className="mt-2">
                  {p.plan === 'enterprise' && p.price_monthly_da === 0 ? (
                    <p className="text-lg font-black text-immo-accent-green">Sur devis</p>
                  ) : p.plan === 'free' ? (
                    <p className="text-lg font-black text-immo-text-primary">Gratuit</p>
                  ) : (
                    <>
                      <span className="text-xl font-black text-immo-text-primary">{p.price_monthly_da.toLocaleString('fr-DZ')}</span>
                      <span className="ml-1 text-xs text-immo-text-muted">DA/mois</span>
                    </>
                  )}
                </div>
                <ul className="mt-3 space-y-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-immo-text-secondary">
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-immo-accent-green" /> {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && p.plan !== 'free' && (
                  <Button onClick={() => startUpgrade(p.plan)} className="mt-4 w-full bg-immo-accent-green text-immo-bg-primary hover:opacity-90">
                    Choisir
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment requests */}
      <div>
        <h2 className="mb-3 text-base font-bold text-immo-text-primary">Demandes de paiement</h2>
        {reqLoading ? (
          <LoadingSpinner size="md" className="h-32" />
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-8 text-center">
            <CreditCard className="mx-auto h-8 w-8 text-immo-text-muted" />
            <p className="mt-2 text-sm text-immo-text-muted">Aucune demande</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map(r => {
              const s = STATUS_STYLES[r.status]
              const StatusIcon = s.icon
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    s.color === 'green' ? 'bg-immo-accent-green/15 text-immo-accent-green' :
                    s.color === 'orange' ? 'bg-immo-status-orange/15 text-immo-status-orange' :
                    s.color === 'red' ? 'bg-immo-status-red/15 text-immo-status-red' :
                    'bg-immo-text-muted/15 text-immo-text-muted'
                  }`}>
                    <StatusIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-immo-text-primary">
                      {PLAN_LABELS[r.plan] ?? r.plan} — {r.billing_cycle === 'yearly' ? 'Annuel' : 'Mensuel'}
                    </p>
                    <p className="text-[11px] text-immo-text-muted">
                      {METHOD_LABELS[r.method] ?? r.method} · {format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}
                      {r.rejection_reason && <span className="ml-2 text-immo-status-red">· {r.rejection_reason}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-immo-text-primary">{r.amount_da.toLocaleString('fr-DZ')} DA</p>
                    <p className={`text-[11px] font-semibold ${
                      s.color === 'green' ? 'text-immo-accent-green' :
                      s.color === 'orange' ? 'text-immo-status-orange' :
                      s.color === 'red' ? 'text-immo-status-red' :
                      'text-immo-text-muted'
                    }`}>{s.label}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <PaymentRequestModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} presetPlan={presetPlan} />
    </div>
  )
}
