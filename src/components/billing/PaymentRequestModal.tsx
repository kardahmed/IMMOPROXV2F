import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Building2, Banknote, MessageCircle, CreditCard, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

type Method = 'bank_transfer' | 'ccp' | 'cash' | 'whatsapp'
type Cycle = 'monthly' | 'yearly'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Pre-select a plan (shows other plans too). If omitted the user picks. */
  presetPlan?: string
}

interface PlanPrice {
  plan: string
  label: string
  price_monthly_da: number
  price_yearly_da: number
  features: string[]
  display_order: number
  active: boolean
}

interface PlatformBilling {
  billing_whatsapp: string | null
  bank_name: string | null
  bank_rib: string | null
  bank_iban: string | null
  bank_swift: string | null
  bank_account_holder: string | null
  ccp_account: string | null
  billing_instructions: string | null
}

export function PaymentRequestModal({ isOpen, onClose, presetPlan }: Props) {
  const { tenantId, userProfile } = useAuthStore()
  const qc = useQueryClient()

  const [step, setStep] = useState<'plan' | 'method' | 'done'>(presetPlan ? 'method' : 'plan')
  const [plan, setPlan] = useState(presetPlan ?? 'pro')
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [method, setMethod] = useState<Method>('bank_transfer')
  const [notes, setNotes] = useState('')

  const { data: plans = [] } = useQuery({
    queryKey: ['plan-prices'],
    queryFn: async () => {
      const { data } = await supabase.from('plan_prices').select('*').eq('active', true).order('display_order')
      return (data ?? []) as PlanPrice[]
    },
  })

  const { data: billing } = useQuery({
    queryKey: ['platform-billing'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_settings')
        .select('billing_whatsapp, bank_name, bank_rib, bank_iban, bank_swift, bank_account_holder, ccp_account, billing_instructions')
        .limit(1).single()
      return (data ?? null) as PlatformBilling | null
    },
  })

  const selectedPlan = useMemo(() => plans.find(p => p.plan === plan), [plans, plan])
  const amount = useMemo(() => {
    if (!selectedPlan) return 0
    return cycle === 'yearly' ? selectedPlan.price_yearly_da : selectedPlan.price_monthly_da
  }, [selectedPlan, cycle])

  const submit = useMutation({
    mutationFn: async () => {
      if (!tenantId || !selectedPlan) throw new Error('Session invalide')
      const { data: req, error } = await supabase.from('payment_requests').insert({
        tenant_id: tenantId,
        requested_by: userProfile?.id ?? null,
        plan,
        billing_cycle: cycle,
        amount_da: amount,
        method,
        status: 'pending',
        notes: notes || null,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      } as never).select('id').single()
      if (error) throw error

      const whatsappNumber = (billing?.billing_whatsapp ?? '213542766068').replace(/\D/g, '')
      const methodLabels: Record<Method, string> = {
        bank_transfer: 'Virement bancaire',
        ccp: 'Versement CCP',
        cash: 'Paiement en especes',
        whatsapp: 'Autre (a discuter)',
      }
      const tenantName = (userProfile as unknown as { tenant?: { name?: string } } | null)?.tenant?.name ?? 'Mon agence'
      const msg = [
        `Bonjour IMMO PRO-X,`,
        ``,
        `Je souhaite souscrire au plan *${selectedPlan.label}* (${cycle === 'yearly' ? 'annuel' : 'mensuel'}).`,
        ``,
        `Agence : ${tenantName}`,
        `Montant : ${amount.toLocaleString('fr-DZ')} DA`,
        `Moyen de paiement : ${methodLabels[method]}`,
        notes ? `\nNote : ${notes}` : '',
        ``,
        `Reference de demande : ${(req as { id: string }).id.slice(0, 8).toUpperCase()}`,
      ].filter(Boolean).join('\n')

      const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`
      window.open(url, '_blank', 'noopener,noreferrer')

      await supabase.from('payment_requests').update({ whatsapp_message_sent: true } as never).eq('id', (req as { id: string }).id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-requests'] })
      setStep('done')
      toast.success('Demande envoyee — WhatsApp ouvert')
    },
    onError: (err) => {
      toast.error((err as Error).message ?? 'Erreur')
    },
  })

  function handleClose() {
    setStep(presetPlan ? 'method' : 'plan')
    setNotes('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Souscrire a un plan" subtitle="Paiement manuel — nous vous contactons par WhatsApp" size="lg">
      {step === 'plan' && (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3 rounded-lg bg-immo-bg-primary p-3">
            <span className={`text-xs font-medium ${cycle === 'monthly' ? 'text-immo-text-primary' : 'text-immo-text-muted'}`}>Mensuel</span>
            <button onClick={() => setCycle(c => c === 'monthly' ? 'yearly' : 'monthly')}
              className={`relative h-6 w-11 rounded-full transition-colors ${cycle === 'yearly' ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`}>
              <div className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ left: cycle === 'yearly' ? '22px' : '2px' }} />
            </button>
            <span className={`text-xs font-medium ${cycle === 'yearly' ? 'text-immo-text-primary' : 'text-immo-text-muted'}`}>Annuel</span>
            {cycle === 'yearly' && <span className="rounded-full bg-immo-accent-green/15 px-2 py-0.5 text-[10px] font-bold text-immo-accent-green">-17%</span>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {plans.filter(p => p.plan !== 'free').map(p => {
              const price = cycle === 'yearly' ? p.price_yearly_da : p.price_monthly_da
              const isContact = p.plan === 'enterprise' && price === 0
              return (
                <button key={p.plan} onClick={() => setPlan(p.plan)}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${
                    plan === p.plan ? 'border-immo-accent-green bg-immo-accent-green/5' : 'border-immo-border-default hover:border-immo-accent-green/50'
                  }`}>
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-bold text-immo-text-primary">{p.label}</span>
                    {plan === p.plan && <Check className="h-4 w-4 text-immo-accent-green" />}
                  </div>
                  <div className="mt-2">
                    {isContact ? (
                      <span className="text-base font-bold text-immo-accent-green">Sur devis</span>
                    ) : (
                      <>
                        <span className="text-xl font-black text-immo-text-primary">{price.toLocaleString('fr-DZ')}</span>
                        <span className="ml-1 text-xs text-immo-text-muted">DA/{cycle === 'yearly' ? 'an' : 'mois'}</span>
                      </>
                    )}
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {p.features.slice(0, 4).map(f => (
                      <li key={f} className="flex items-start gap-1.5 text-[11px] text-immo-text-secondary">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-immo-accent-green" /> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep('method')} disabled={!selectedPlan}
              className="bg-immo-accent-green text-immo-bg-primary hover:opacity-90">
              Continuer <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 'method' && selectedPlan && (
        <div className="space-y-4">
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-primary p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-immo-text-muted">Plan choisi</p>
                <p className="text-base font-bold text-immo-text-primary">{selectedPlan.label} — {cycle === 'yearly' ? 'Annuel' : 'Mensuel'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-immo-text-muted">Montant</p>
                <p className="text-lg font-black text-immo-accent-green">{amount.toLocaleString('fr-DZ')} DA</p>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-immo-text-secondary">Moyen de paiement</p>
            <div className="space-y-2">
              <MethodCard active={method === 'bank_transfer'} onClick={() => setMethod('bank_transfer')}
                icon={<Building2 className="h-5 w-5" />} title="Virement bancaire"
                desc="Vous recevrez le RIB/IBAN par WhatsApp apres validation" />
              <MethodCard active={method === 'ccp'} onClick={() => setMethod('ccp')}
                icon={<CreditCard className="h-5 w-5" />} title="Versement CCP"
                desc="Numero CCP communique par WhatsApp" />
              <MethodCard active={method === 'cash'} onClick={() => setMethod('cash')}
                icon={<Banknote className="h-5 w-5" />} title="Paiement en especes"
                desc="Rendez-vous a convenir selon votre wilaya" />
              <MethodCard active={method === 'whatsapp'} onClick={() => setMethod('whatsapp')}
                icon={<MessageCircle className="h-5 w-5" />} title="Autre / a discuter"
                desc="Nous convenons du moyen ensemble" />
            </div>
          </div>

          {billing?.billing_instructions && (
            <div className="rounded-lg bg-immo-accent-blue/5 border border-immo-accent-blue/20 p-3">
              <p className="text-xs text-immo-text-secondary">{billing.billing_instructions}</p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-immo-text-secondary">Message (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Questions, remarques..."
              className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary outline-none focus:border-immo-accent-green" />
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            {!presetPlan && <Button variant="ghost" onClick={() => setStep('plan')} className="text-immo-text-secondary">Retour</Button>}
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}
              className="ml-auto bg-immo-accent-green text-immo-bg-primary hover:opacity-90">
              <MessageCircle className="mr-1.5 h-4 w-4" /> {submit.isPending ? 'Envoi...' : 'Envoyer la demande via WhatsApp'}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="py-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-immo-accent-green/10">
            <Check className="h-7 w-7 text-immo-accent-green" />
          </div>
          <h3 className="mt-4 text-base font-bold text-immo-text-primary">Demande enregistree</h3>
          <p className="mt-1 text-sm text-immo-text-secondary">
            WhatsApp s'est ouvert avec le message pre-rempli. Envoyez-le pour confirmer.
            <br />Votre plan sera active des reception du paiement.
          </p>
          <Button onClick={handleClose} className="mt-5 bg-immo-accent-green text-immo-bg-primary">Fermer</Button>
        </div>
      )}
    </Modal>
  )
}

function MethodCard({ active, onClick, icon, title, desc }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string
}) {
  return (
    <button onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
        active ? 'border-immo-accent-green bg-immo-accent-green/5' : 'border-immo-border-default hover:border-immo-accent-green/50'
      }`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
        active ? 'bg-immo-accent-green/15 text-immo-accent-green' : 'bg-immo-bg-primary text-immo-text-muted'
      }`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-immo-text-primary">{title}</p>
        <p className="text-xs text-immo-text-muted">{desc}</p>
      </div>
      {active && <Check className="h-4 w-4 shrink-0 text-immo-accent-green" />}
    </button>
  )
}
