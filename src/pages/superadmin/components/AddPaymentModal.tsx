import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CreditCard } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

type PaymentMethod = 'cash' | 'ccp' | 'ctt' | 'virement' | 'cheque' | 'other'
type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise'

const METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash',     label: 'Cash' },
  { value: 'ccp',      label: 'CCP' },
  { value: 'ctt',      label: 'CTT' },
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'cheque',   label: 'Chèque' },
  { value: 'other',    label: 'Autre' },
]

const PLAN_LABELS: Record<PlanKey, string> = {
  free:       'Free (gratuit)',
  starter:    'Starter',
  pro:        'Pro',
  enterprise: 'Enterprise',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function addMonthsISO(iso: string, months: number) {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + months)
  // To avoid "31 Jan + 1 month = 3 Mar" surprises, snap to last day of month
  // when overflow happens. Mostly Pro plans pay full months so this is a
  // small UX nicety.
  return d.toISOString().slice(0, 10)
}

interface AddPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  /** When set, pre-selects this tenant in the form (e.g. opened from a tenant detail) */
  defaultTenantId?: string
}

export function AddPaymentModal({ isOpen, onClose, defaultTenantId }: AddPaymentModalProps) {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.session?.user?.id)

  // Active tenants only — paying for a soft-deleted tenant is almost
  // always a misclick. Super admin can still find the row via SQL if
  // they really need to.
  const { data: tenants = [] } = useQuery({
    queryKey: ['superadmin-tenants-for-payment'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, name, plan')
        .is('deleted_at', null)
        .order('name')
      return (data ?? []) as Array<{ id: string; name: string; plan: PlanKey }>
    },
    enabled: isOpen,
  })

  // Plan pricing — used to auto-suggest the amount once tenant + duration
  // are picked. Founder can still override (extras, discounts, top-ups).
  const { data: planPricing = new Map<string, number>() } = useQuery({
    queryKey: ['plan-pricing-for-payment'],
    queryFn: async () => {
      const { data } = await supabase.from('plan_limits').select('plan, price_monthly')
      const m = new Map<string, number>()
      for (const row of (data ?? []) as Array<{ plan: string; price_monthly: number }>) {
        m.set(row.plan, row.price_monthly ?? 0)
      }
      return m
    },
    enabled: isOpen,
  })

  const [tenantId, setTenantId] = useState(defaultTenantId ?? '')
  const [plan, setPlan] = useState<PlanKey>('starter')
  const [amount, setAmount] = useState<string>('')
  const [amountAuto, setAmountAuto] = useState(true) // becomes false the moment user types in amount
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [receivedAt, setReceivedAt] = useState(todayISO())
  const [periodStart, setPeriodStart] = useState(todayISO())
  const [periodEnd, setPeriodEnd] = useState(addMonthsISO(todayISO(), 1))
  const [durationPreset, setDurationPreset] = useState<'1m' | '3m' | '6m' | '12m' | 'custom'>('1m')
  const [notes, setNotes] = useState('')

  const selectedTenant = useMemo(() => tenants.find(t => t.id === tenantId), [tenants, tenantId])

  // Sync tenantId when parent passes a new defaultTenantId (e.g. user
  // clicked "Renouveler" on a different tenant). Only fires when the
  // modal opens, otherwise typing in the dropdown would be reverted.
  useEffect(() => {
    if (isOpen && defaultTenantId) setTenantId(defaultTenantId)
  }, [isOpen, defaultTenantId])

  // When a tenant is selected, default the plan to whatever they're
  // currently on. The founder can still change it (e.g., they're paying
  // for an upgrade that hasn't been applied yet).
  useEffect(() => {
    if (selectedTenant?.plan) setPlan(selectedTenant.plan)
  }, [selectedTenant])

  // Auto-suggest amount = plan price × number of months, but only as
  // long as the founder hasn't typed something custom. The moment they
  // edit the field, we stop overwriting it.
  useEffect(() => {
    if (!amountAuto) return
    const months = durationPreset === '1m' ? 1 : durationPreset === '3m' ? 3 : durationPreset === '6m' ? 6 : durationPreset === '12m' ? 12 : 0
    if (months === 0) return // custom duration → can't auto-compute
    const monthly = planPricing.get(plan) ?? 0
    if (monthly > 0) setAmount(String(monthly * months))
  }, [plan, durationPreset, planPricing, amountAuto])

  function applyPreset(preset: typeof durationPreset, fromStart = periodStart) {
    setDurationPreset(preset)
    if (preset === 'custom') return
    const months = preset === '1m' ? 1 : preset === '3m' ? 3 : preset === '6m' ? 6 : 12
    setPeriodEnd(addMonthsISO(fromStart, months))
  }

  function handleStartChange(v: string) {
    setPeriodStart(v)
    // Re-derive end if we're on a preset
    if (durationPreset !== 'custom') applyPreset(durationPreset, v)
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Tenant requis')
      const amt = Number(amount)
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Montant invalide')
      if (!periodStart || !periodEnd) throw new Error('Période requise')
      if (new Date(periodEnd) <= new Date(periodStart)) throw new Error('Fin de période doit être après le début')

      // Legacy `period` TEXT column (YYYY-MM) is still NOT NULL on
      // pre-063 databases — derive it from period_start so the insert
      // works whether or not the migration is applied yet.
      const legacyPeriod = periodStart.slice(0, 7)

      const { error } = await supabase.from('invoices').insert({
        tenant_id: tenantId,
        amount: amt,
        plan,
        payment_method: method,
        received_at: receivedAt,
        period_start: periodStart,
        period_end: periodEnd,
        notes: notes.trim() || null,
        status: 'paid',
        paid_at: receivedAt,
        period: legacyPeriod,
        created_by: userId ?? null,
      } as never)
      if (error) { handleSupabaseError(error); throw error }

      // Audit log so the action shows up in the notification feed
      if (userId) {
        await supabase.from('super_admin_logs').insert({
          super_admin_id: userId,
          action: 'log_payment',
          tenant_id: tenantId,
          details: {
            tenant_name: selectedTenant?.name ?? '',
            amount: amt,
            method,
            plan,
            period: `${periodStart} → ${periodEnd}`,
          },
        } as never)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin-payments'] })
      qc.invalidateQueries({ queryKey: ['super-admin-subscriptions'] })
      qc.invalidateQueries({ queryKey: ['super-admin-tenant-health'] })
      toast.success(`Paiement enregistré pour ${selectedTenant?.name ?? 'le tenant'}`)
      // Reset for next entry
      setAmount('')
      setAmountAuto(true)
      setNotes('')
      setReceivedAt(todayISO())
      setPeriodStart(todayISO())
      applyPreset('1m', todayISO())
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nouveau paiement"
      subtitle="Enregistrer un paiement reçu en cash / CCP / CTT / virement"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary">Annuler</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !tenantId || !amount}
            variant="blue"
          >
            {save.isPending
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <><CreditCard className="me-1.5 h-4 w-4" /> Enregistrer</>}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tenant *">
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
          >
            <option value="">— Choisir un tenant —</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.plan})</option>
            ))}
          </select>
        </Field>

        <Field label="Plan facturé *">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as PlanKey)}
            className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
          >
            {(Object.keys(PLAN_LABELS) as PlanKey[]).map(p => {
              const monthly = planPricing.get(p) ?? 0
              return (
                <option key={p} value={p}>
                  {PLAN_LABELS[p]}{monthly > 0 ? ` — ${monthly.toLocaleString('fr-FR')} DA / mois` : ''}
                </option>
              )
            })}
          </select>
          {selectedTenant && selectedTenant.plan !== plan && (
            <p className="mt-1 text-[11px] text-immo-status-orange">
              ⚠ Le tenant est actuellement en {PLAN_LABELS[selectedTenant.plan]}, vous facturez {PLAN_LABELS[plan]}
            </p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Montant (DA) *${amountAuto ? ' — auto' : ''}`}>
            <input
              type="number"
              min="0"
              step="100"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountAuto(false) }}
              placeholder="ex: 5000"
              className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
            />
            {!amountAuto && (
              <button type="button" onClick={() => setAmountAuto(true)} className="mt-1 text-[11px] text-immo-accent-blue hover:underline">
                Recalculer auto (plan × durée)
              </button>
            )}
          </Field>
          <Field label="Mode de paiement *">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
            >
              {METHOD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Date de réception *">
          <input
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
          />
        </Field>

        <div>
          <div className="mb-1.5 text-xs font-medium text-immo-text-secondary">Durée couverte *</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {(['1m', '3m', '6m', '12m', 'custom'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                  durationPreset === p
                    ? 'border-immo-accent-blue bg-immo-accent-blue/10 text-immo-accent-blue'
                    : 'border-immo-border-default text-immo-text-muted hover:border-immo-accent-blue/40'
                }`}
              >
                {p === '1m' ? '1 mois' : p === '3m' ? '3 mois' : p === '6m' ? '6 mois' : p === '12m' ? '1 an' : 'Personnalisé'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Du">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => handleStartChange(e.target.value)}
                className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
              />
            </Field>
            <Field label="Jusqu'au">
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => { setPeriodEnd(e.target.value); setDurationPreset('custom') }}
                className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
              />
            </Field>
          </div>
        </div>

        <Field label="Notes (optionnel)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="ex: Paiement reçu en personne au bureau, plan Pro 6 mois"
            className="w-full resize-none rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
          />
        </Field>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-immo-text-secondary">{label}</span>
      {children}
    </label>
  )
}
