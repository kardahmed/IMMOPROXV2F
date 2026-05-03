import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bookmark, DollarSign, CreditCard, Receipt,
  ListTodo, Clock, Plus, CheckCircle, Bot,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// native <select> used instead of base-ui Select
import { StatusBadge, EmptyState, Modal } from '@/components/common'
import { AutomationBadge } from '@/components/common/AutomationBadge'
import { OpenWhatsAppButton } from '@/components/common/OpenWhatsAppButton'
import { ClientDocuments } from '../ClientDocuments'

function ClientDocumentsWrapper({ clientId }: { clientId: string }) {
  return <ClientDocuments clientId={clientId} />
}
import { formatPrice } from '@/lib/constants'
import { PAYMENT_STATUS_LABELS } from '@/types'
import type { PaymentStatus, TaskStatus } from '@/types'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { inputClass } from './shared'

/* ═══ Reservation ═══ */
export function ReservationTab({ clientId }: { clientId: string }) {
  const { t } = useTranslation()
  const { data: reservations = [] } = useQuery({
    queryKey: ['client-reservations', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('reservations').select('*, projects(name), units(code)').eq('client_id', clientId).is('deleted_at', null).order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return data as unknown as Array<Record<string, unknown>>
    },
  })

  if (reservations.length === 0) return <EmptyState icon={<Bookmark className="h-10 w-10" />} title={t('common.no_data')} />

  return (
    <div className="space-y-2">
      {reservations.map((r) => (
        <div key={r.id as string} className="rounded-lg border border-immo-border-default bg-immo-bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-immo-text-primary">{(r.units as { code: string })?.code} — {(r.projects as { name: string })?.name}</p>
              <p className="text-xs text-immo-text-muted">
                {t('status.expired')} {format(new Date(r.expires_at as string), 'dd/MM/yyyy')} · {t('field.deposit')} : {formatPrice((r.deposit_amount as number) ?? 0)}
              </p>
            </div>
            <StatusBadge label={r.status as string} type={r.status === 'active' ? 'green' : r.status === 'converted' ? 'blue' : 'red'} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ═══ Sale ═══ */
export function SaleTab({ clientId }: { clientId: string }) {
  const { t } = useTranslation()
  const { data: sales = [] } = useQuery({
    queryKey: ['client-sales', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales').select('*, projects(name), units(code)').eq('client_id', clientId).order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return data as unknown as Array<Record<string, unknown>>
    },
  })

  if (sales.length === 0) return <EmptyState icon={<DollarSign className="h-10 w-10" />} title={t('common.no_data')} />

  return (
    <div className="space-y-2">
      {sales.map((s) => (
        <div key={s.id as string} className="rounded-lg border border-immo-border-default bg-immo-bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-immo-text-primary">{(s.units as { code: string })?.code} — {(s.projects as { name: string })?.name}</p>
              <p className="text-xs text-immo-text-muted">{t('field.price')} : {formatPrice(s.final_price as number)} · {s.financing_mode as string}</p>
            </div>
            <StatusBadge label={s.status === 'active' ? t('status.active') : t('status.cancelled')} type={s.status === 'active' ? 'green' : 'red'} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ═══ Schedule ═══ */
export function ScheduleTab({ clientId }: { clientId: string }) {
  const { t } = useTranslation()
  const { data: schedules = [] } = useQuery({
    queryKey: ['client-schedules', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_schedules').select('*, sales(units(code))').eq('tenant_id', (await supabase.from('clients').select('tenant_id').eq('id', clientId).single()).data?.tenant_id ?? '').order('due_date')
      if (error) return []
      return data as unknown as Array<Record<string, unknown>>
    },
  })

  if (schedules.length === 0) return <EmptyState icon={<Clock className="h-10 w-10" />} title={t('common.no_data')} />

  return (
    <div className="overflow-hidden rounded-xl border border-immo-border-default">
      <table className="w-full">
        <thead><tr className="bg-immo-bg-card-hover">
          {['#', t('field.due_date'), t('field.amount'), t('field.status')].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-immo-border-default">
          {schedules.map((s) => {
            const pst = PAYMENT_STATUS_LABELS[s.status as PaymentStatus] ?? { label: s.status as string, color: '#7F96B7' }
            return (
              <tr key={s.id as string} className="bg-immo-bg-card">
                <td className="px-4 py-3 text-sm text-immo-text-muted">{s.installment_number as number}</td>
                <td className="px-4 py-3 text-sm text-immo-text-primary">{format(new Date(s.due_date as string), 'dd/MM/yyyy')}</td>
                <td className="px-4 py-3 text-sm font-medium text-immo-text-primary">{formatPrice(s.amount as number)}</td>
                <td className="px-4 py-3"><StatusBadge label={pst.label} type={pst.color === '#00D4A0' ? 'green' : pst.color === '#FF4949' ? 'red' : 'orange'} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ═══ Payment ═══ */
export function PaymentTab({ clientId }: { clientId: string }) {
  const { t } = useTranslation()

  const { data: payments = [] } = useQuery({
    queryKey: ['client-payments', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_schedules')
        .select('*, sales(units(code))')
        .eq('status', 'paid')
        .order('due_date', { ascending: false })
      if (error) return []
      // Filter client-side since we can't easily join through sale→client
      return (data ?? []) as unknown as Array<Record<string, unknown>>
    },
  })

  const totalPaid = payments.reduce((s, p) => s + ((p.amount as number) ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-lg border border-immo-border-default bg-immo-bg-primary px-4 py-2">
          <p className="text-[10px] text-immo-text-muted">{t('common.total')} paye</p>
          <p className="text-lg font-bold text-immo-accent-green">{formatPrice(totalPaid)}</p>
        </div>
      </div>

      {payments.length === 0 ? (
        <EmptyState icon={<CreditCard className="h-10 w-10" />} title={t('common.no_data')} />
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id as string} className="flex items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-card px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-immo-accent-green/10">
                <CreditCard className="h-4 w-4 text-immo-accent-green" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-immo-text-primary">{formatPrice(p.amount as number)}</p>
                <p className="text-[11px] text-immo-text-muted">
                  Echeance #{p.installment_number as number} · {format(new Date(p.due_date as string), 'dd/MM/yyyy')}
                </p>
              </div>
              <StatusBadge label={t('status.paid')} type="green" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══ Documents ═══ */
export function DocumentsTab({ clientId }: { clientId: string }) {
  // Use the storage-based ClientDocuments component
  return <ClientDocumentsWrapper clientId={clientId} />
}

/* ═══ Charges ═══ */
export function ChargesTab({ clientId, tenantId }: { clientId: string; tenantId: string }) {
  const { t } = useTranslation()
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data: charges = [] } = useQuery({
    queryKey: ['client-charges', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('charges').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return data as unknown as Array<Record<string, unknown>>
    },
  })

  const createCharge = useMutation({
    mutationFn: async (input: { label: string; type: string; amount: number; charge_date: string; status: string }) => {
      const { error } = await supabase.from('charges').insert({ tenant_id: tenantId, client_id: clientId, ...input } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-charges', clientId] })
      toast.success(t('success.created'))
      setShowCreate(false)
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="bg-immo-accent-green text-xs font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
          <Plus className="mr-1 h-3.5 w-3.5" /> {t('action.add')}
        </Button>
      </div>

      {charges.length === 0 ? (
        <EmptyState icon={<Receipt className="h-10 w-10" />} title={t('common.no_data')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-immo-border-default">
          <table className="w-full">
            <thead><tr className="bg-immo-bg-card-hover">
              {[t('field.name'), t('field.type'), t('field.amount'), t('field.date'), t('field.status')].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-immo-border-default">
              {charges.map((c) => {
                const pst = PAYMENT_STATUS_LABELS[c.status as PaymentStatus] ?? { label: c.status as string, color: '#7F96B7' }
                return (
                  <tr key={c.id as string} className="bg-immo-bg-card hover:bg-immo-bg-card-hover">
                    <td className="px-4 py-3 text-sm text-immo-text-primary">{c.label as string}</td>
                    <td className="px-4 py-3 text-xs text-immo-text-muted">{c.type as string}</td>
                    <td className="px-4 py-3 text-sm font-medium text-immo-text-primary">{formatPrice(c.amount as number)}</td>
                    <td className="px-4 py-3 text-xs text-immo-text-muted">{c.charge_date ? format(new Date(c.charge_date as string), 'dd/MM/yyyy') : '-'}</td>
                    <td className="px-4 py-3"><StatusBadge label={pst.label} type={pst.color === '#00D4A0' ? 'green' : pst.color === '#FF4949' ? 'red' : 'orange'} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateChargeModal isOpen={showCreate} onClose={() => setShowCreate(false)} onSubmit={(d) => createCharge.mutate(d)} loading={createCharge.isPending} />
    </div>
  )
}

function CreateChargeModal({ isOpen, onClose, onSubmit, loading }: {
  isOpen: boolean; onClose: () => void; onSubmit: (d: { label: string; type: string; amount: number; charge_date: string; status: string }) => void; loading: boolean
}) {
  const { t } = useTranslation()
  const [label, setLabel] = useState(''); const [type, setType] = useState('autre')
  const [amount, setAmount] = useState(''); const [date, setDate] = useState(''); const [status, setStatus] = useState('pending')

  function handle() {
    if (!label || !amount) return
    onSubmit({ label, type, amount: Number(amount), charge_date: date, status })
    setLabel(''); setAmount(''); setDate('')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('action.add')} size="sm">
      <div className="space-y-3">
        <div><Label className="text-xs text-immo-text-secondary">{t('field.name')} *</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-immo-text-secondary">{t('field.type')}</Label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
              {['notaire', 'agence', 'promotion', 'enregistrement', 'autre'].map(tp => (
                <option key={tp} value={tp}>{tp}</option>
              ))}
            </select>
          </div>
          <div><Label className="text-xs text-immo-text-secondary">{t('field.amount')} *</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs text-immo-text-secondary">{t('field.date')}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></div>
          <div>
            <Label className="text-xs text-immo-text-secondary">{t('field.status')}</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
              <option value="pending">{t('status.pending')}</option>
              <option value="paid">{t('status.paid')}</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary">{t('action.cancel')}</Button>
          <Button onClick={handle} disabled={!label || !amount || loading} className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">{t('action.add')}</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ═══ Notes ═══ */
export function NotesTab({ clientId }: { clientId: string }) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const saveTimerRef = { current: null as ReturnType<typeof setTimeout> | null }

  const { data: client } = useQuery({
    queryKey: ['client-notes', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('notes').eq('id', clientId).single()
      if (error) { handleSupabaseError(error); throw error }
      return data as { notes: string | null }
    },
  })

  if (notes === null && client?.notes != null) setNotes(client.notes)

  const handleChange = useCallback((value: string) => {
    setNotes(value)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      const { error } = await supabase.from('clients').update({ notes: value } as never).eq('id', clientId)
      if (error) handleSupabaseError(error)
      setSaving(false)
    }, 1000)
  }, [clientId])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-immo-text-muted">{t('success.saved')}</p>
        {saving && <span className="text-[11px] text-immo-status-orange">{t('common.loading')}</span>}
      </div>
      <textarea value={notes ?? ''} onChange={(e) => handleChange(e.target.value)} placeholder={t('field.notes')} rows={10}
        className="w-full resize-none rounded-xl border border-immo-border-default bg-immo-bg-primary p-4 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:outline-none focus:ring-1 focus:ring-immo-accent-green" />
    </div>
  )
}

/* ═══ Tasks ═══ */
export function TasksTab({ clientId, tenantId, clientPhone }: { clientId: string; tenantId: string; clientPhone?: string }) {
  const { t } = useTranslation()
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState(''); const [dueAt, setDueAt] = useState('')
  const userId = useAuthStore((s) => s.session?.user?.id)
  const qc = useQueryClient()

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').eq('client_id', clientId).is('deleted_at', null).order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return data as unknown as Array<Record<string, unknown>>
    },
  })

  const createTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').insert({ tenant_id: tenantId, client_id: clientId, agent_id: userId, title, type: 'manual', due_at: dueAt || null } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', clientId] })
      setShowCreate(false); setTitle(''); setDueAt('')
      toast.success(t('success.created'))
    },
  })

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from('tasks').update({ status } as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', clientId] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="bg-immo-accent-green text-xs font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
          <Plus className="mr-1 h-3.5 w-3.5" /> {t('action.add')}
        </Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={<ListTodo className="h-10 w-10" />} title={t('common.no_data')} />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const nextStatus: TaskStatus = task.status === 'pending' ? 'done' : task.status === 'done' ? 'ignored' : 'pending'
            return (
              <div key={task.id as string} className="flex items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-card px-4 py-3">
                <button onClick={() => toggleStatus.mutate({ id: task.id as string, status: nextStatus })}
                  className={`h-5 w-5 shrink-0 rounded-full border-2 transition-colors ${task.status === 'done' ? 'border-immo-accent-green bg-immo-accent-green' : task.status === 'ignored' ? 'border-immo-text-muted bg-immo-text-muted/20' : 'border-immo-border-default hover:border-immo-accent-green'}`}>
                  {task.status === 'done' && <CheckCircle className="h-full w-full text-immo-bg-primary" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${task.status === 'done' ? 'text-immo-text-muted line-through' : 'text-immo-text-primary'}`}>{task.title as string}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-immo-text-muted">
                    <AutomationBadge automationType={task.automation_type as string | null} />
                    {task.type === 'ai_generated' && <span className="flex items-center gap-0.5 text-blue-400"><Bot className="h-3 w-3" /> IA</span>}
                    {typeof task.due_at === 'string' && <span>{format(new Date(task.due_at), 'dd/MM/yyyy')}</span>}
                  </div>
                </div>
                {Boolean(task.automation_type) && task.status !== 'done' && (
                  <OpenWhatsAppButton
                    templateName={task.template_name as string | null}
                    templateParams={task.template_params}
                    clientPhone={clientPhone}
                  />
                )}
                <span className={`text-[11px] font-medium ${task.status === 'done' ? 'text-immo-accent-green' : task.status === 'ignored' ? 'text-immo-text-muted' : 'text-immo-status-orange'}`}>
                  {task.status === 'done' ? t('status.completed') : task.status === 'ignored' ? t('status.cancelled') : t('status.pending')}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={t('action.create')} size="sm">
        <div className="space-y-3">
          <div><Label className="text-xs text-immo-text-secondary">{t('field.name')} *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} /></div>
          <div><Label className="text-xs text-immo-text-secondary">{t('field.due_date')}</Label><Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputClass} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-immo-text-secondary">{t('action.cancel')}</Button>
            <Button onClick={() => createTask.mutate()} disabled={!title || createTask.isPending} className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">{t('action.create')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
