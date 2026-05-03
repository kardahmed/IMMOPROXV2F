import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, FileText, AlertTriangle, Plus, Filter, Calendar, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DataTable, KPICard, PageHeader, PageSkeleton, StatusBadge } from '@/components/common'
import type { Column } from '@/components/common'
import { Button } from '@/components/ui/button'
import { formatPriceCompact } from '@/lib/constants'
import { format, differenceInDays } from 'date-fns'
import { AddPaymentModal } from './components/AddPaymentModal'

const METHOD_LABELS: Record<string, { label: string; type: 'green' | 'orange' | 'red' | 'muted' | 'blue' }> = {
  cash:     { label: 'Cash',     type: 'green' },
  ccp:      { label: 'CCP',      type: 'blue' },
  ctt:      { label: 'CTT',      type: 'blue' },
  virement: { label: 'Virement', type: 'blue' },
  cheque:   { label: 'Chèque',   type: 'muted' },
  other:    { label: 'Autre',    type: 'muted' },
}

interface PaymentRow {
  id: string
  tenant_id: string
  amount: number
  plan: string | null
  payment_method: string | null
  received_at: string | null
  period_start: string | null
  period_end: string | null
  notes: string | null
  created_at: string
  tenants: { name: string } | null
}

const PLAN_BADGE: Record<string, { label: string; type: 'green' | 'orange' | 'red' | 'muted' | 'blue' }> = {
  free:       { label: 'Free',       type: 'muted' },
  starter:    { label: 'Starter',    type: 'blue' },
  pro:        { label: 'Pro',        type: 'green' },
  enterprise: { label: 'Enterprise', type: 'orange' },
}

interface SubStatus {
  tenant_id: string
  tenant_name: string
  expires_on: string | null
  status: 'active' | 'expiring_soon' | 'renewal_due' | 'expired' | 'no_payment'
  days_until_expiry: number
}

export function BillingPage() {
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [renewTenantId, setRenewTenantId] = useState<string | undefined>(undefined)

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['super-admin-payments'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, tenant_id, amount, plan, payment_method, received_at, period_start, period_end, notes, created_at, tenants(name)')
        .order('received_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      return (data ?? []) as unknown as PaymentRow[]
    },
  })

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['super-admin-subscriptions'],
    queryFn: async () => {
      // View shipped in migration 063 — typed entry not in
      // database.generated.ts yet. Cast through never; the row shape
      // is the SubStatus interface above.
      const { data } = await supabase
        .from('tenant_subscription_status' as never)
        .select('*')
      return (data ?? []) as unknown as SubStatus[]
    },
  })

  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthRevenue = payments
      .filter(p => (p.received_at ?? '').startsWith(thisMonth))
      .reduce((s, p) => s + (p.amount ?? 0), 0)
    const totalRevenue = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
    const activeSubs = subscriptions.filter(s => s.status === 'active' || s.status === 'renewal_due' || s.status === 'expiring_soon').length
    const expiringCount = subscriptions.filter(s => s.status === 'expiring_soon' || s.status === 'expired').length
    return { monthRevenue, totalRevenue, activeSubs, expiringCount }
  }, [payments, subscriptions])

  const filtered = methodFilter === 'all'
    ? payments
    : payments.filter(p => p.payment_method === methodFilter)

  if (isLoading) return <PageSkeleton kpiCount={4} hasTable />

  const FILTER_OPTIONS = [
    { value: 'all',      label: 'Tous' },
    { value: 'cash',     label: 'Cash' },
    { value: 'ccp',      label: 'CCP' },
    { value: 'ctt',      label: 'CTT' },
    { value: 'virement', label: 'Virement' },
    { value: 'cheque',   label: 'Chèque' },
  ]

  const columns: Column<PaymentRow>[] = [
    {
      key: 'tenant',
      header: 'Tenant',
      render: (p) => <span className="text-sm font-medium text-immo-text-primary">{p.tenants?.name ?? '-'}</span>,
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (p) => {
        const meta = PLAN_BADGE[p.plan ?? 'starter'] ?? PLAN_BADGE.starter
        return <StatusBadge label={meta.label} type={meta.type} />
      },
    },
    {
      key: 'amount',
      header: 'Montant',
      align: 'right',
      render: (p) => <span className="text-sm font-semibold text-immo-accent-green">{formatPriceCompact(p.amount)} DA</span>,
    },
    {
      key: 'method',
      header: 'Mode',
      render: (p) => {
        const m = METHOD_LABELS[p.payment_method ?? 'other'] ?? METHOD_LABELS.other
        return <StatusBadge label={m.label} type={m.type} />
      },
    },
    {
      key: 'received_at',
      header: 'Reçu le',
      render: (p) => <span className="text-xs text-immo-text-muted">{p.received_at ? format(new Date(p.received_at), 'dd/MM/yyyy') : '-'}</span>,
    },
    {
      key: 'period',
      header: 'Période couverte',
      render: (p) => (
        <span className="text-xs text-immo-text-muted">
          {p.period_start && p.period_end
            ? `${format(new Date(p.period_start), 'dd/MM/yy')} → ${format(new Date(p.period_end), 'dd/MM/yy')}`
            : '-'}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (p) => <span className="line-clamp-1 max-w-[220px] text-xs text-immo-text-muted">{p.notes ?? '-'}</span>,
    },
  ]

  // Tenants sorted by urgency: expired first, then expiring soon, etc.
  const urgencyOrder: Record<SubStatus['status'], number> = {
    expired: 0, expiring_soon: 1, renewal_due: 2, no_payment: 3, active: 4,
  }
  const urgentTenants = [...subscriptions]
    .filter(s => s.status !== 'active')
    .sort((a, b) => urgencyOrder[a.status] - urgencyOrder[b.status])
    .slice(0, 8)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paiements"
        subtitle="Journal des paiements reçus + suivi des renouvellements"
        actions={
          <Button onClick={() => setAddOpen(true)} variant="blue">
            <Plus className="mr-1.5 h-4 w-4" /> Nouveau paiement
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Encaissé ce mois" value={`${formatPriceCompact(stats.monthRevenue)} DA`} accent="green" icon={<DollarSign className="h-5 w-5 text-immo-accent-green" />} />
        <KPICard label="Encaissé total" value={`${formatPriceCompact(stats.totalRevenue)} DA`} accent="blue" icon={<TrendingUp className="h-5 w-5 text-immo-accent-blue" />} />
        <KPICard label="Abonnements actifs" value={stats.activeSubs} accent="green" icon={<Calendar className="h-5 w-5 text-immo-accent-green" />} />
        <KPICard label="A relancer" value={stats.expiringCount} accent="red" icon={<AlertTriangle className="h-5 w-5 text-immo-status-red" />} />
      </div>

      {urgentTenants.length > 0 && (
        <div className="rounded-xl border border-immo-status-orange/30 bg-immo-status-orange-bg/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-immo-status-orange" />
            <h3 className="text-sm font-semibold text-immo-text-primary">Tenants à relancer</h3>
            <span className="text-xs text-immo-text-muted">({urgentTenants.length})</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {urgentTenants.map(s => {
              const isExpired = s.status === 'expired'
              const noPayment = s.status === 'no_payment'
              const days = s.expires_on ? differenceInDays(new Date(s.expires_on), new Date()) : null
              return (
                <div
                  key={s.tenant_id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    isExpired ? 'border-immo-status-red/30 bg-immo-status-red-bg/30' : 'border-immo-border-default bg-immo-bg-primary'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-immo-text-primary">{s.tenant_name}</div>
                    <div className="text-[11px] text-immo-text-muted">
                      {noPayment
                        ? 'Aucun paiement enregistré'
                        : isExpired
                          ? `Expiré depuis ${Math.abs(days ?? 0)}j`
                          : s.expires_on ? `Expire dans ${days}j (${format(new Date(s.expires_on), 'dd/MM/yyyy')})` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={isExpired ? 'Expiré' : noPayment ? 'Jamais payé' : s.status === 'expiring_soon' ? 'Bientôt' : 'Renouv.'}
                      type={isExpired || noPayment ? 'red' : s.status === 'expiring_soon' ? 'orange' : 'muted'}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setRenewTenantId(s.tenant_id); setAddOpen(true) }}
                      className="h-7 border border-immo-accent-blue/30 text-[11px] text-immo-accent-blue hover:bg-immo-accent-blue/10"
                    >
                      Renouveler
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-immo-text-muted" />
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setMethodFilter(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              methodFilter === opt.value
                ? 'bg-immo-accent-blue/10 text-immo-accent-blue'
                : 'text-immo-text-muted hover:bg-immo-bg-card-hover'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-immo-text-muted">{filtered.length} paiement(s)</span>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(p) => p.id}
        emptyIcon={<FileText className="h-10 w-10" />}
        emptyMessage={methodFilter === 'all' ? 'Aucun paiement enregistré' : 'Aucun paiement avec ce mode'}
        emptyDescription={methodFilter === 'all' ? 'Commencez par enregistrer votre premier paiement avec le bouton ci-dessus.' : 'Changez de filtre pour voir d\'autres paiements.'}
      />

      <AddPaymentModal
        isOpen={addOpen}
        onClose={() => { setAddOpen(false); setRenewTenantId(undefined) }}
        defaultTenantId={renewTenantId}
      />
    </div>
  )
}
