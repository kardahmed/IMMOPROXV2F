import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Info, Upload, CheckSquare, Square, X, FileText, Image as ImageIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { useProjects } from '@/hooks/useProjects'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatPrice } from '@/lib/constants'
import { UNIT_TYPE_LABELS } from '@/types'
import type { PipelineStage, UnitType } from '@/types'
import { addDays } from 'date-fns'
import toast from 'react-hot-toast'

interface ClientInfo {
  id: string
  full_name: string
  phone: string
  nin_cin: string | null
  pipeline_stage: PipelineStage
  tenant_id: string
}

interface CreateReservationModalProps {
  isOpen: boolean
  onClose: () => void
  client: ClientInfo | null
  /** Fired after a successful reservation insert (before the modal
   *  closes). Lets the caller trigger downstream effects like
   *  auto-task generation for the new stage. */
  onSuccess?: () => void
}

interface AvailableUnit {
  id: string
  code: string
  type: UnitType
  subtype: string | null
  surface: number | null
  price: number | null
}

const DURATION_KEYS = [
  { value: '15', i18nKey: 'reservation_modal.duration_15' },
  { value: '30', i18nKey: 'reservation_modal.duration_30' },
  { value: '60', i18nKey: 'reservation_modal.duration_60' },
]

const DEPOSIT_METHOD_KEYS = [
  { value: 'cash', i18nKey: 'reservation_modal.method_cash' },
  { value: 'bank_transfer', i18nKey: 'reservation_modal.method_bank_transfer' },
  { value: 'cheque', i18nKey: 'reservation_modal.method_cheque' },
]

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const inputClass = 'border-immo-border-default bg-immo-bg-primary text-immo-text-primary placeholder:text-immo-text-muted'
const labelClass = 'text-[11px] font-medium text-immo-text-muted'

export function CreateReservationModal({ isOpen, onClose, client, onSuccess }: CreateReservationModalProps) {
  const { t } = useTranslation()
  const userId = useAuthStore((s) => s.session?.user?.id)
  const { projects } = useProjects()
  const qc = useQueryClient()

  // Form state
  const [projectId, setProjectId] = useState('')
  const [selectedUnits, setSelectedUnits] = useState<string[]>([])
  const [ninCin, setNinCin] = useState(client?.nin_cin ?? '')
  const [duration, setDuration] = useState('30')
  const [cinFile, setCinFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')

  // Deposit state
  const [showDeposit, setShowDeposit] = useState(false)
  const [depositMode, setDepositMode] = useState<'amount' | 'percentage'>('amount')
  const [depositValue, setDepositValue] = useState('')
  const [depositMethod, setDepositMethod] = useState('')
  const [depositReference, setDepositReference] = useState('')

  // Fetch available units for selected project
  const { data: availableUnits = [] } = useQuery({
    queryKey: ['available-units', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('units')
        .select('id, code, type, subtype, surface, price')
        .eq('project_id', projectId)
        .eq('status', 'available')
        .order('code')
      if (error) { handleSupabaseError(error); throw error }
      return data as unknown as AvailableUnit[]
    },
    enabled: !!projectId,
  })

  // Reset units when project changes
  function handleProjectChange(id: string) {
    setProjectId(id)
    setSelectedUnits([])
  }

  // Toggle unit selection
  function toggleUnit(unitId: string) {
    setSelectedUnits((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    )
  }

  // File handling
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setFileError('')
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError('Format accepté : JPG, PNG, WebP ou PDF')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError('Taille maximale : 5 Mo')
      return
    }
    setCinFile(file)
  }

  // Calculate deposit amount
  const totalPrice = useMemo(() => {
    return availableUnits
      .filter((u) => selectedUnits.includes(u.id))
      .reduce((s, u) => s + (u.price ?? 0), 0)
  }, [availableUnits, selectedUnits])

  const depositAmount = useMemo(() => {
    if (!showDeposit || !depositValue) return 0
    const val = Number(depositValue)
    return depositMode === 'percentage' ? (totalPrice * val) / 100 : val
  }, [showDeposit, depositValue, depositMode, totalPrice])

  // Validation
  const needsReference = depositMethod === 'bank_transfer' || depositMethod === 'cheque'
  const isValid =
    projectId &&
    selectedUnits.length > 0 &&
    ninCin.trim().length > 0 &&
    cinFile &&
    (!showDeposit || (depositValue && depositMethod && (!needsReference || depositReference)))

  // Submit
  const mutation = useMutation({
    mutationFn: async () => {
      if (!client || !userId || !cinFile) return

      const expiresAt = addDays(new Date(), Number(duration)).toISOString()

      // 1. Upload CIN
      const ext = cinFile.name.split('.').pop()
      const path = `${client.tenant_id}/cin/${client.id}_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(path, cinFile)
      if (uploadErr) { handleSupabaseError(uploadErr); throw uploadErr }

      // Use storage path as reference (signed URLs generated on-demand for viewing)
      const cinUrl = path

      // 2. Update client NIN + CIN doc
      await supabase.from('clients').update({
        nin_cin: ninCin,
        cin_doc_url: cinUrl,
        cin_verified: false,
      } as never).eq('id', client.id)

      // 3. Create reservation for each selected unit
      for (const unitId of selectedUnits) {
        const { error: resErr } = await supabase.from('reservations').insert({
          tenant_id: client.tenant_id,
          client_id: client.id,
          agent_id: userId,
          project_id: projectId,
          unit_id: unitId,
          nin_cin: ninCin,
          duration_days: Number(duration),
          expires_at: expiresAt,
          deposit_amount: showDeposit ? depositAmount : 0,
          deposit_method: showDeposit && depositMethod ? depositMethod : null,
          deposit_reference: showDeposit && depositReference ? depositReference : null,
        } as never)
        if (resErr) { handleSupabaseError(resErr); throw resErr }
        // Trigger update_unit_on_reservation handles unit status change
      }

      // 4. Move client to reservation stage
      await supabase.from('clients').update({
        pipeline_stage: 'reservation',
      } as never).eq('id', client.id)

      // 5. History entry
      const unitCodes = availableUnits
        .filter((u) => selectedUnits.includes(u.id))
        .map((u) => u.code)
        .join(', ')

      await supabase.from('history').insert({
        tenant_id: client.tenant_id,
        client_id: client.id,
        agent_id: userId,
        type: 'reservation',
        title: `Réservation créée : ${unitCodes}`,
        metadata: {
          project_id: projectId,
          unit_ids: selectedUnits,
          duration_days: Number(duration),
          deposit_amount: depositAmount,
        },
      } as never)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client-detail'] })
      qc.invalidateQueries({ queryKey: ['client-reservations'] })
      qc.invalidateQueries({ queryKey: ['units'] })
      qc.invalidateQueries({ queryKey: ['pipeline-stats'] })
      toast.success(t('reservation_modal.success'))
      onSuccess?.()
      resetAndClose()
    },
  })

  function resetAndClose() {
    setProjectId(''); setSelectedUnits([]); setNinCin(client?.nin_cin ?? ''); setDuration('30')
    setCinFile(null); setFileError(''); setShowDeposit(false); setDepositValue('')
    setDepositMethod(''); setDepositReference(''); setDepositMode('amount')
    onClose()
  }

  if (!client) return null

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title={t('reservation_modal.title')} size="lg">
      <div className="space-y-5">
        {/* Info banner */}
        <div className="flex gap-3 rounded-lg border border-immo-accent-blue/30 bg-immo-accent-blue-bg px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-immo-accent-blue" />
          <p className="text-xs text-immo-accent-blue">
            {t('reservation_modal.info_banner')}
          </p>
        </div>

        {/* Client info */}
        <div className="flex items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-primary px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-immo-accent-green/15 text-xs font-bold text-immo-accent-green">
            {client.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-immo-text-primary">{client.full_name}</p>
            <p className="text-[11px] text-immo-text-muted">{client.phone}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Left column */}
          <div className="space-y-4">
            {/* Project */}
            <div>
              <Label className={labelClass}>{t('reservation_modal.project')}</Label>
              <Select value={projectId} onValueChange={(v) => { if (v) handleProjectChange(v) }}>
                <SelectTrigger className={`mt-1 ${inputClass}`}><SelectValue placeholder={t('reservation_modal.select_project')} /></SelectTrigger>
                <SelectContent className="border-immo-border-default bg-immo-bg-card">
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover">
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Units selection */}
            <div>
              <div className="flex items-center justify-between">
                <Label className={labelClass}>{t('reservation_modal.available_units')}</Label>
                {selectedUnits.length > 0 && (
                  <span className="text-[11px] font-medium text-immo-accent-green">
                    {t('reservation_modal.units_selected', { count: selectedUnits.length })}
                  </span>
                )}
              </div>
              <div className="mt-1 max-h-[200px] space-y-1 overflow-y-auto rounded-lg border border-immo-border-default bg-immo-bg-primary p-2">
                {!projectId ? (
                  <p className="py-4 text-center text-[11px] text-immo-text-muted">{t('reservation_modal.select_project_first')}</p>
                ) : availableUnits.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-immo-text-muted">{t('reservation_modal.no_units_available')}</p>
                ) : (
                  availableUnits.map((u) => {
                    const selected = selectedUnits.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUnit(u.id)}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                          selected
                            ? 'bg-immo-accent-green/10 ring-1 ring-immo-accent-green/30'
                            : 'hover:bg-immo-bg-card-hover'
                        }`}
                      >
                        {selected ? (
                          <CheckSquare className="h-4 w-4 shrink-0 text-immo-accent-green" />
                        ) : (
                          <Square className="h-4 w-4 shrink-0 text-immo-text-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-immo-text-primary">{u.code}</span>
                          <span className="ml-2 text-[11px] text-immo-text-muted">
                            {UNIT_TYPE_LABELS[u.type]}{u.subtype ? ` ${u.subtype}` : ''}
                          </span>
                        </div>
                        {u.surface != null && <span className="text-[11px] text-immo-text-muted">{u.surface}m²</span>}
                        {u.price != null && <span className="text-xs font-medium text-immo-text-primary">{formatPrice(u.price)}</span>}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* NIN */}
            <div>
              <Label className={labelClass}>{t('reservation_modal.nin_cin')}</Label>
              <Input value={ninCin} onChange={(e) => setNinCin(e.target.value)} placeholder={t('reservation_modal.nin_cin_placeholder')} className={`mt-1 ${inputClass}`} />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Duration */}
            <div>
              <Label className={labelClass}>{t('reservation_modal.duration')}</Label>
              <Select value={duration} onValueChange={(v) => { if (v) setDuration(v) }}>
                <SelectTrigger className={`mt-1 ${inputClass}`}><SelectValue /></SelectTrigger>
                <SelectContent className="border-immo-border-default bg-immo-bg-card">
                  {DURATION_KEYS.map((d) => (
                    <SelectItem key={d.value} value={d.value} className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover">
                      {t(d.i18nKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-immo-text-muted">
                {t('reservation_modal.duration_hint')}
              </p>
            </div>

            {/* CIN Upload */}
            <div>
              <Label className={labelClass}>{t('reservation_modal.cin_card')}</Label>
              <div className="mt-1">
                {cinFile ? (
                  <div className="flex items-center gap-3 rounded-lg border border-immo-accent-green/30 bg-immo-accent-green-bg px-3 py-2.5">
                    {cinFile.type === 'application/pdf' ? (
                      <FileText className="h-5 w-5 text-immo-accent-green" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-immo-accent-green" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-immo-accent-green">{cinFile.name}</p>
                      <p className="text-[10px] text-immo-accent-green/70">{(cinFile.size / 1024).toFixed(0)} Ko</p>
                    </div>
                    <button onClick={() => setCinFile(null)} className="text-immo-accent-green hover:text-immo-text-primary">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-immo-border-default px-4 py-5 transition-colors hover:border-immo-accent-green/40 hover:bg-immo-accent-green/5">
                    <Upload className="h-6 w-6 text-immo-text-muted" />
                    <span className="text-xs text-immo-text-muted">{t('reservation_modal.file_size_hint')}</span>
                    <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFileChange} className="hidden" />
                  </label>
                )}
                {fileError && <p className="mt-1 text-[11px] text-immo-status-red">{fileError}</p>}
              </div>
            </div>

            {/* Deposit toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowDeposit(!showDeposit)}
                className="flex items-center gap-2 text-xs font-medium text-immo-text-secondary hover:text-immo-text-primary"
              >
                <div className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${showDeposit ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`}>
                  <div className={`h-4 w-4 rounded-full bg-white transition-transform ${showDeposit ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                {t('reservation_modal.add_deposit')}
              </button>
            </div>

            {/* Deposit fields */}
            {showDeposit && (
              <div className="space-y-3 rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
                {/* Toggle amount / percentage */}
                <div className="flex gap-1 rounded-lg border border-immo-border-default p-0.5">
                  <button
                    type="button"
                    onClick={() => setDepositMode('amount')}
                    className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
                      depositMode === 'amount' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'
                    }`}
                  >
                    {t('reservation_modal.amount_dzd')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositMode('percentage')}
                    className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
                      depositMode === 'percentage' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'
                    }`}
                  >
                    {t('reservation_modal.percentage')}
                  </button>
                </div>

                <div>
                  <Label className={labelClass}>
                    {depositMode === 'amount' ? t('reservation_modal.amount_label') : t('reservation_modal.percentage_label')}
                  </Label>
                  <Input
                    type="number"
                    value={depositValue}
                    onChange={(e) => setDepositValue(e.target.value)}
                    placeholder={depositMode === 'amount' ? '500000' : '10'}
                    className={`mt-1 ${inputClass}`}
                  />
                  {depositMode === 'percentage' && totalPrice > 0 && depositValue && (
                    <p className="mt-1 text-[10px] text-immo-accent-green">
                      = {formatPrice(depositAmount)}
                    </p>
                  )}
                </div>

                <div>
                  <Label className={labelClass}>{t('reservation_modal.payment_method')}</Label>
                  <Select value={depositMethod} onValueChange={(v) => { if (v) setDepositMethod(v) }}>
                    <SelectTrigger className={`mt-1 ${inputClass}`}><SelectValue placeholder={t('reservation_modal.select')} /></SelectTrigger>
                    <SelectContent className="border-immo-border-default bg-immo-bg-card">
                      {DEPOSIT_METHOD_KEYS.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover">
                          {t(m.i18nKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {needsReference && (
                  <div>
                    <Label className={labelClass}>{t('reservation_modal.payment_reference')}</Label>
                    <Input
                      value={depositReference}
                      onChange={(e) => setDepositReference(e.target.value)}
                      placeholder={t('reservation_modal.payment_reference_placeholder')}
                      className={`mt-1 ${inputClass}`}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Total summary */}
        {selectedUnits.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-immo-border-default bg-immo-bg-card-hover px-4 py-3">
            <div>
              <p className="text-xs text-immo-text-muted">{t('reservation_modal.summary_units_days', { count: selectedUnits.length, days: duration })}</p>
              <p className="text-sm font-semibold text-immo-text-primary">{t('reservation_modal.total', { amount: formatPrice(totalPrice) })}</p>
            </div>
            {showDeposit && depositAmount > 0 && (
              <div className="text-right">
                <p className="text-xs text-immo-text-muted">{t('reservation_modal.deposit')}</p>
                <p className="text-sm font-semibold text-immo-accent-green">{formatPrice(depositAmount)}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-immo-border-default pt-4">
          <Button
            variant="ghost"
            onClick={resetAndClose}
            className="text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary"
          >
            {t('reservation_modal.cancel')}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90 disabled:opacity-50"
          >
            {mutation.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-immo-bg-primary border-t-transparent" />
            ) : (
              t('reservation_modal.create')
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
