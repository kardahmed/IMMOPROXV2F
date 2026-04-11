import { useQuery } from '@tanstack/react-query'
import { DollarSign, FileText, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { KPICard, LoadingSpinner, StatusBadge } from '@/components/common'
import { formatPriceCompact } from '@/lib/constants'
import { format } from 'date-fns'

export function BillingPage() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['super-admin-invoices'],
    queryFn: async () => {
      const { data } = await supabase.from('invoices').select('*, tenants(name)').order('created_at', { ascending: false })
      return (data ?? []) as Array<Record<string, unknown>>
    },
  })

  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + ((i.amount as number) ?? 0), 0)
  const pendingAmount = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + ((i.amount as number) ?? 0), 0)
  const overdueCount = invoices.filter(i => i.status === 'overdue').length

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  const STATUS_MAP: Record<string, { label: string; type: 'green' | 'orange' | 'red' | 'muted' }> = {
    paid: { label: 'Paye', type: 'green' },
    pending: { label: 'En attente', type: 'orange' },
    overdue: { label: 'En retard', type: 'red' },
    cancelled: { label: 'Annule', type: 'muted' },
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-immo-text-primary">Facturation</h1>

      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Revenus totaux" value={formatPriceCompact(totalRevenue)} accent="green" icon={<DollarSign className="h-5 w-5 text-immo-accent-green" />} />
        <KPICard label="En attente" value={formatPriceCompact(pendingAmount)} accent="orange" icon={<FileText className="h-5 w-5 text-immo-status-orange" />} />
        <KPICard label="En retard" value={overdueCount} accent="red" icon={<AlertTriangle className="h-5 w-5 text-immo-status-red" />} />
      </div>

      <div className="overflow-hidden rounded-xl border border-immo-border-default">
        <table className="w-full">
          <thead><tr className="bg-immo-bg-card-hover">
            {['Tenant', 'Periode', 'Montant', 'Echeance', 'Statut'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase text-immo-text-muted">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-immo-border-default">
            {invoices.map(inv => {
              const tenant = inv.tenants as { name: string } | null
              const st = STATUS_MAP[(inv.status as string)] ?? STATUS_MAP.pending
              return (
                <tr key={inv.id as string} className="bg-immo-bg-card hover:bg-immo-bg-card-hover">
                  <td className="px-4 py-3 text-sm text-immo-text-primary">{tenant?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-immo-text-muted">{inv.period as string}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-immo-accent-green">{formatPriceCompact(inv.amount as number)} DA</td>
                  <td className="px-4 py-3 text-xs text-immo-text-muted">{inv.due_date ? format(new Date(inv.due_date as string), 'dd/MM/yyyy') : '-'}</td>
                  <td className="px-4 py-3"><StatusBadge label={st.label} type={st.type} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {invoices.length === 0 && <div className="py-12 text-center text-sm text-immo-text-muted">Aucune facture</div>}
      </div>
    </div>
  )
}
