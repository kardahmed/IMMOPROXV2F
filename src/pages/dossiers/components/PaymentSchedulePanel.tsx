import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarSign, Check, Clock, AlertTriangle, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge, Modal } from '@/components/common'
import { formatPrice } from '@/lib/constants'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface Schedule {
  id: string
  installment_number: number
  description: string
  amount: number
  due_date: string
  status: string
  paid_at: string | null
}

interface Charge {
  id: string
  charge_type: string
  label: string
  amount: number
  paid: boolean
}

const STATUS_STYLES: Record<string, { label: string; type: 'green' | 'orange' | 'red' | 'muted' }> = {
  paid: { label: 'Paye', type: 'green' },
  pending: { label: 'En attente', type: 'orange' },
  late: { label: 'En retard', type: 'red' },
}

interface Props {
  saleId: string
  totalPrice: number
  clientName: string
}

export function PaymentSchedulePanel({ saleId, totalPrice, clientName }: Props) {
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [payLabel, setPayLabel] = useState('')

  const { data: schedules = [] } = useQuery({
    queryKey: ['payment-schedules', saleId],
    queryFn: async () => {
      const { data } = await supabase.from('payment_schedules').select('*').eq('sale_id', saleId).order('installment_number')
      return (data ?? []) as Schedule[]
    },
  })

  const { data: charges = [] } = useQuery({
    queryKey: ['sale-charges', saleId],
    queryFn: async () => {
      const { data } = await supabase.from('sale_charges').select('*').eq('sale_id', saleId).order('created_at')
      return (data ?? []) as Charge[]
    },
  })

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_schedules').update({ status: 'paid', paid_at: new Date().toISOString() } as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-schedules', saleId] }); toast.success('Paiement marque comme paye') },
  })

  const addSchedule = useMutation({
    mutationFn: async () => {
      const nextNum = schedules.length + 1
      const { error } = await supabase.from('payment_schedules').insert({
        tenant_id: tenantId,
        sale_id: saleId,
        installment_number: nextNum,
        description: payLabel || `Echeance ${nextNum}`,
        amount: parseFloat(payAmount) || 0,
        due_date: payDate,
        status: 'pending',
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-schedules', saleId] })
      setShowAddPayment(false); setPayAmount(''); setPayDate(''); setPayLabel('')
      toast.success('Echeance ajoutee')
    },
  })

  const toggleChargePaid = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from('sale_charges').update({ paid, paid_at: paid ? new Date().toISOString() : null } as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sale-charges', saleId] }),
  })

  const totalPaid = schedules.filter(s => s.status === 'paid').reduce((sum, s) => sum + s.amount, 0)
  const totalDue = schedules.filter(s => s.status !== 'paid').reduce((sum, s) => sum + s.amount, 0)
  const totalLate = schedules.filter(s => s.status === 'late').reduce((sum, s) => sum + s.amount, 0)
  const progress = totalPrice > 0 ? Math.round((totalPaid / totalPrice) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Header KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg bg-immo-accent-green/10 p-3 text-center">
          <p className="text-[10px] font-medium text-immo-text-muted">Paye</p>
          <p className="text-sm font-bold text-immo-accent-green">{formatPrice(totalPaid)}</p>
        </div>
        <div className="rounded-lg bg-immo-status-orange/10 p-3 text-center">
          <p className="text-[10px] font-medium text-immo-text-muted">Restant</p>
          <p className="text-sm font-bold text-immo-status-orange">{formatPrice(totalDue)}</p>
        </div>
        <div className="rounded-lg bg-immo-status-red/10 p-3 text-center">
          <p className="text-[10px] font-medium text-immo-text-muted">En retard</p>
          <p className="text-sm font-bold text-immo-status-red">{formatPrice(totalLate)}</p>
        </div>
        <div className="rounded-lg bg-immo-accent-blue/10 p-3 text-center">
          <p className="text-[10px] font-medium text-immo-text-muted">Progression</p>
          <p className="text-sm font-bold text-immo-accent-blue">{progress}%</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-immo-border-default">
        <div className="h-full rounded-full bg-immo-accent-green transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* Schedule list */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
        <div className="flex items-center justify-between border-b border-immo-border-default px-4 py-3">
          <h3 className="text-sm font-semibold text-immo-text-primary">Echeancier — {clientName}</h3>
          <Button onClick={() => setShowAddPayment(true)} size="sm" className="h-7 bg-immo-accent-green text-xs text-white">
            <Plus className="mr-1 h-3 w-3" /> Echeance
          </Button>
        </div>
        <div className="divide-y divide-immo-border-default">
          {schedules.map(s => {
            const st = STATUS_STYLES[s.status] ?? STATUS_STYLES.pending
            return (
              <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${s.status === 'late' ? 'bg-immo-status-red/5' : ''}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${s.status === 'paid' ? 'bg-immo-accent-green/15 text-immo-accent-green' : s.status === 'late' ? 'bg-immo-status-red/15 text-immo-status-red' : 'bg-immo-border-default text-immo-text-muted'}`}>
                  {s.status === 'paid' ? <Check className="h-4 w-4" /> : s.status === 'late' ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-immo-text-primary">{s.description}</p>
                  <p className="text-[10px] text-immo-text-muted">
                    Echeance: {format(new Date(s.due_date), 'dd/MM/yyyy')}
                    {s.paid_at && ` · Paye le ${format(new Date(s.paid_at), 'dd/MM/yyyy')}`}
                  </p>
                </div>
                <span className="text-sm font-semibold text-immo-text-primary">{formatPrice(s.amount)}</span>
                <StatusBadge label={st.label} type={st.type} />
                {s.status !== 'paid' && (
                  <Button onClick={() => markPaid.mutate(s.id)} disabled={markPaid.isPending} size="sm" className="h-7 border border-immo-accent-green/30 bg-transparent text-[10px] text-immo-accent-green hover:bg-immo-accent-green/10">
                    <DollarSign className="mr-1 h-3 w-3" /> Encaisser
                  </Button>
                )}
              </div>
            )
          })}
          {schedules.length === 0 && <p className="px-4 py-6 text-center text-xs text-immo-text-muted">Aucune echeance</p>}
        </div>
      </div>

      {/* Charges */}
      {charges.length > 0 && (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
          <div className="border-b border-immo-border-default px-4 py-3">
            <h3 className="text-sm font-semibold text-immo-text-primary">Charges & Frais</h3>
          </div>
          <div className="divide-y divide-immo-border-default">
            {charges.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <button onClick={() => toggleChargePaid.mutate({ id: c.id, paid: !c.paid })}
                  className={`flex h-5 w-5 items-center justify-center rounded border ${c.paid ? 'border-immo-accent-green bg-immo-accent-green text-white' : 'border-immo-border-default'}`}>
                  {c.paid && <Check className="h-3 w-3" />}
                </button>
                <div className="flex-1">
                  <p className={`text-sm ${c.paid ? 'text-immo-text-muted line-through' : 'text-immo-text-primary'}`}>{c.label}</p>
                  <p className="text-[10px] text-immo-text-muted capitalize">{c.charge_type}</p>
                </div>
                <span className="text-sm font-medium text-immo-text-primary">{formatPrice(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add payment modal */}
      <Modal isOpen={showAddPayment} onClose={() => setShowAddPayment(false)} title="Ajouter une echeance" size="sm">
        <div className="space-y-3">
          <div><Label className="text-[11px] text-immo-text-muted">Description</Label><Input value={payLabel} onChange={e => setPayLabel(e.target.value)} placeholder="Ex: Echeance 5" className="border-immo-border-default" /></div>
          <div><Label className="text-[11px] text-immo-text-muted">Montant (DA)</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="500000" className="border-immo-border-default" /></div>
          <div><Label className="text-[11px] text-immo-text-muted">Date d'echeance</Label><Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="border-immo-border-default" /></div>
          <Button onClick={() => addSchedule.mutate()} disabled={!payAmount || !payDate || addSchedule.isPending} className="w-full bg-immo-accent-green text-white">Ajouter</Button>
        </div>
      </Modal>
    </div>
  )
}
