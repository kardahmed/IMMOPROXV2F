import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarSign, FileText, AlertTriangle, Check, Send, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DataTable, KPICard, PageHeader, PageSkeleton, StatusBadge } from '@/components/common'
import type { Column } from '@/components/common'
import { Button } from '@/components/ui/button'
import { formatPriceCompact } from '@/lib/constants'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export function BillingPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['super-admin-invoices'],
    queryFn: async () => {
      const { data } = await supabase.from('invoices').select('*, tenants(name)').order('created_at', { ascending: false })
      return (data ?? []) as Array<Record<string, unknown>>
    },
  })

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() } as never).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['super-admin-invoices'] }); toast.success('Facture marquée comme payée') },
  })

  const markOverdue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invoices').update({ status: 'overdue' } as never).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['super-admin-invoices'] }); toast.success('Facture marquée en retard') },
  })

  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + ((i.amount as number) ?? 0), 0)
  const pendingAmount = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + ((i.amount as number) ?? 0), 0)
  const overdueCount = invoices.filter(i => i.status === 'overdue').length
  const mrrEstimate = invoices.filter(i => i.status === 'paid' || i.status === 'pending').reduce((s, i) => s + ((i.amount as number) ?? 0), 0)

  const filtered = statusFilter === 'all' ? invoices : invoices.filter(i => i.status === statusFilter)

  if (isLoading) return <PageSkeleton kpiCount={4} hasTable />

  const STATUS_MAP: Record<string, { label: string; type: 'green' | 'orange' | 'red' | 'muted' }> = {
    paid: { label: 'Paye', type: 'green' },
    pending: { label: 'En attente', type: 'orange' },
    overdue: { label: 'En retard', type: 'red' },
    cancelled: { label: 'Annule', type: 'muted' },
  }

  const FILTER_OPTIONS = [
    { value: 'all', label: 'Toutes' },
    { value: 'pending', label: 'En attente' },
    { value: 'overdue', label: 'En retard' },
    { value: 'paid', label: 'Payees' },
  ]

  type Invoice = Record<string, unknown>

  const columns: Column<Invoice>[] = [
    {
      key: 'tenant',
      header: 'Tenant',
      render: (inv) => <span className="text-sm text-immo-text-primary">{(inv.tenants as { name: string } | null)?.name ?? '-'}</span>,
    },
    {
      key: 'period',
      header: 'Periode',
      render: (inv) => <span className="text-xs text-immo-text-muted">{inv.period as string}</span>,
    },
    {
      key: 'amount',
      header: 'Montant',
      align: 'right',
      render: (inv) => <span className="text-sm font-semibold text-immo-accent-green">{formatPriceCompact(inv.amount as number)} DA</span>,
    },
    {
      key: 'due_date',
      header: 'Echeance',
      render: (inv) => <span className="text-xs text-immo-text-muted">{inv.due_date ? format(new Date(inv.due_date as string), 'dd/MM/yyyy') : '-'}</span>,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (inv) => {
        const st = STATUS_MAP[inv.status as string] ?? STATUS_MAP.pending
        return <StatusBadge label={st.label} type={st.type} />
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (inv) => {
        const isPending = inv.status === 'pending'
        const isOverdue = inv.status === 'overdue'
        return (
          <div className="flex justify-end gap-1.5">
            {(isPending || isOverdue) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => markPaid.mutate(inv.id as string)}
                className="h-7 border border-immo-accent-green/30 text-[11px] text-immo-accent-green hover:bg-immo-accent-green/10"
              >
                <Check className="mr-1 h-3 w-3" /> Paye
              </Button>
            )}
            {isPending && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => markOverdue.mutate(inv.id as string)}
                className="h-7 border border-immo-status-red/30 text-[11px] text-immo-status-red hover:bg-immo-status-red/10"
              >
                <Send className="mr-1 h-3 w-3" /> Relancer
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturation"
        subtitle="Suivi des paiements, impayes et revenus par tenant"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Revenus totaux" value={formatPriceCompact(totalRevenue)} accent="green" icon={<DollarSign className="h-5 w-5 text-immo-accent-green" />} />
        <KPICard label="MRR estime" value={formatPriceCompact(mrrEstimate)} accent="blue" icon={<FileText className="h-5 w-5 text-immo-accent-blue" />} />
        <KPICard label="En attente" value={formatPriceCompact(pendingAmount)} accent="orange" icon={<FileText className="h-5 w-5 text-immo-status-orange" />} />
        <KPICard label="En retard" value={overdueCount} accent="red" icon={<AlertTriangle className="h-5 w-5 text-immo-status-red" />} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-immo-text-muted" />
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-immo-accent-green/10 text-immo-accent-green'
                : 'text-immo-text-muted hover:bg-immo-bg-card-hover'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-immo-text-muted">{filtered.length} facture(s)</span>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(inv) => inv.id as string}
        emptyIcon={<FileText className="h-10 w-10" />}
        emptyMessage={statusFilter === 'all' ? 'Aucune facture' : 'Aucune facture dans ce statut'}
        emptyDescription={statusFilter === 'all' ? "Les factures apparaitront ici des qu'elles seront generees." : 'Changez de filtre pour voir d\'autres factures.'}
      />
    </div>
  )
}
