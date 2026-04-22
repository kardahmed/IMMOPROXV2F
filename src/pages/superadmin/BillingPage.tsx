import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarSign, FileText, AlertTriangle, Check, Send, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { EmptyState, KPICard, LoadingSpinner, PageHeader, StatusBadge } from '@/components/common'
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

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

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
      <div className="flex items-center gap-2">
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

      <div className="overflow-hidden rounded-xl border border-immo-border-default">
        <table className="w-full">
          <thead><tr className="bg-immo-bg-card-hover">
            {['Tenant', 'Periode', 'Montant', 'Echeance', 'Statut', 'Actions'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase text-immo-text-muted">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-immo-border-default">
            {filtered.map(inv => {
              const tenant = inv.tenants as { name: string } | null
              const st = STATUS_MAP[(inv.status as string)] ?? STATUS_MAP.pending
              const isPending = inv.status === 'pending'
              const isOverdue = inv.status === 'overdue'
              return (
                <tr key={inv.id as string} className="bg-immo-bg-card hover:bg-immo-bg-card-hover">
                  <td className="px-4 py-3 text-sm text-immo-text-primary">{tenant?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-immo-text-muted">{inv.period as string}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-immo-accent-green">{formatPriceCompact(inv.amount as number)} DA</td>
                  <td className="px-4 py-3 text-xs text-immo-text-muted">{inv.due_date ? format(new Date(inv.due_date as string), 'dd/MM/yyyy') : '-'}</td>
                  <td className="px-4 py-3"><StatusBadge label={st.label} type={st.type} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
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
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title={statusFilter === 'all' ? 'Aucune facture' : 'Aucune facture dans ce statut'}
            description={statusFilter === 'all' ? 'Les factures apparaitront ici des qu\'elles seront generees.' : 'Changez de filtre pour voir d\'autres factures.'}
          />
        )}
      </div>
    </div>
  )
}
