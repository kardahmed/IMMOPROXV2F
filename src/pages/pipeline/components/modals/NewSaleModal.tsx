import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check, Search, LayoutGrid, List, Plus, X,
  Building2, FileText, Download, Printer, Eye, CheckCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { appendClientNote } from '@/lib/clientNotes'
import { useAuthStore } from '@/store/authStore'
import { useProjects } from '@/hooks/useProjects'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPrice, formatPriceCompact } from '@/lib/constants'
import { UNIT_TYPE_LABELS, UNIT_SUBTYPE_LABELS, PIPELINE_STAGES } from '@/types'
import type { PipelineStage, UnitType, UnitSubtype, FinancingMode, DiscountType } from '@/types'
import { format, differenceInMonths, addMonths } from 'date-fns'
import toast from 'react-hot-toast'

/* ═══ Types ═══ */

interface ClientInfo {
  id: string
  full_name: string
  phone: string
  nin_cin: string | null
  pipeline_stage: PipelineStage
  tenant_id: string
}

interface AvailableUnit {
  id: string
  code: string
  type: UnitType
  subtype: UnitSubtype | null
  building: string | null
  floor: number | null
  surface: number | null
  price: number | null
  delivery_date: string | null
  project_id: string
}

interface Amenity {
  id: string
  description: string
  price: number
}

interface ScheduleLine {
  number: number
  date: string
  amount: number
  description: string
}

interface SaleFormData {
  projectId: string
  selectedUnits: string[]
  amenities: Amenity[]
  // Step 3
  discountType: DiscountType | ''
  discountValue: number
  financingMode: FinancingMode
  deliveryDate: string
  // Step 4
  installments: boolean
  frequency: 'monthly' | 'quarterly' | 'semiannual'
  downPaymentPct: number
  firstPaymentDate: string
  // Step 5
  internalNotes: string
}

interface NewSaleModalProps {
  isOpen: boolean
  onClose: () => void
  client: ClientInfo | null
}

/* ═══ Constants ═══ */

const STEP_KEYS = [
  'sale_modal.step_identification',
  'sale_modal.step_units',
  'sale_modal.step_financial',
  'sale_modal.step_documents',
  'sale_modal.step_confirmation',
] as const

const inputClass = 'border-immo-border-default bg-immo-bg-primary text-immo-text-primary placeholder:text-immo-text-muted'
const labelClass = 'text-[11px] font-medium text-immo-text-muted'

/* ═══ Main Component ═══ */

export function NewSaleModal({ isOpen, onClose, client }: NewSaleModalProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState<SaleFormData>({
    projectId: '',
    selectedUnits: [],
    amenities: [],
    discountType: '',
    discountValue: 0,
    financingMode: 'comptant',
    deliveryDate: '',
    installments: false,
    frequency: 'monthly',
    downPaymentPct: 30,
    firstPaymentDate: '',
    internalNotes: '',
  })
  const userId = useAuthStore((s) => s.session?.user?.id)
  const qc = useQueryClient()

  const { projects } = useProjects()

  // Fetch units for selected project
  const { data: units = [] } = useQuery({
    queryKey: ['sale-available-units', formData.projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('units')
        .select('id, code, type, subtype, building, floor, surface, price, delivery_date, project_id')
        .eq('project_id', formData.projectId)
        .eq('status', 'available')
        .order('code')
      return (data ?? []) as unknown as AvailableUnit[]
    },
    enabled: !!formData.projectId,
  })

  // Selected units data
  const selectedUnitsData = useMemo(
    () => units.filter((u) => formData.selectedUnits.includes(u.id)),
    [units, formData.selectedUnits],
  )

  const unitsTotal = selectedUnitsData.reduce((s, u) => s + (u.price ?? 0), 0)
  const amenitiesTotal = formData.amenities.reduce((s, a) => s + a.price, 0)
  const grandTotal = unitsTotal + amenitiesTotal

  // Discount
  const discountAmount = formData.discountType === 'percentage'
    ? (grandTotal * formData.discountValue) / 100
    : formData.discountType === 'fixed' ? formData.discountValue : 0
  const finalPrice = Math.max(grandTotal - discountAmount, 0)

  // Schedule
  const schedule = useMemo((): ScheduleLine[] => {
    if (!formData.installments || !formData.firstPaymentDate || !formData.deliveryDate) return []
    const downPayment = Math.round(finalPrice * formData.downPaymentPct / 100)
    const remaining = finalPrice - downPayment
    const freqMonths = formData.frequency === 'monthly' ? 1 : formData.frequency === 'quarterly' ? 3 : 6
    const deliveryD = new Date(formData.deliveryDate)
    const firstD = new Date(formData.firstPaymentDate)
    // Use calendar months from date-fns. The previous `(deliveryD -
    // firstD) / (30 * 86400000)` was a 30-day-month approximation
    // and drifted ~5 days on a 12-month plan, pushing the last
    // installment past the actual delivery date.
    const totalMonths = Math.max(1, differenceInMonths(deliveryD, firstD))
    const numInstallments = Math.max(1, Math.floor(totalMonths / freqMonths))
    // Guard against `remaining < numInstallments` which would round
    // installmentAmount to 0 and dump everything onto the last row.
    const installmentAmount = numInstallments > 0
      ? Math.max(1, Math.round(remaining / numInstallments))
      : remaining

    const lines: ScheduleLine[] = [
      { number: 1, date: formData.firstPaymentDate, amount: downPayment, description: `Acompte (${formData.downPaymentPct}%)` },
    ]
    for (let i = 0; i < numInstallments; i++) {
      const d = addMonths(firstD, (i + 1) * freqMonths)
      lines.push({
        number: i + 2,
        date: format(d, 'yyyy-MM-dd'),
        amount: i === numInstallments - 1 ? remaining - installmentAmount * (numInstallments - 1) : installmentAmount,
        description: `Échéance ${i + 1}/${numInstallments}`,
      })
    }
    return lines
  }, [formData.installments, formData.firstPaymentDate, formData.deliveryDate, formData.downPaymentPct, formData.frequency, finalPrice])

  // Project name
  const projectName = projects.find((p) => p.id === formData.projectId)?.name ?? ''

  // Default delivery date from first unit
  const defaultDelivery = selectedUnitsData[0]?.delivery_date ?? ''

  // Validation per step
  const canProceed = step === 0
    ? !!formData.projectId
    : step === 1
      ? formData.selectedUnits.length > 0
      : step === 2
        ? !!formData.financingMode
        : step === 3
          ? true
          : true
  const isLastStep = step === STEP_KEYS.length - 1

  // Recap badges
  const badges = [
    { label: 'Client', done: !!client },
    { label: 'Projet', done: !!formData.projectId },
    { label: 'Biens', done: formData.selectedUnits.length > 0 },
    { label: 'CNI', done: !!client?.nin_cin },
  ]
  const doneCount = badges.filter((b) => b.done).length
  const isReady = doneCount === 4

  // Submit mutation
  const submitSale = useMutation({
    mutationFn: async () => {
      if (!client || !userId) return

      // Pre-compute per-unit discounts up-front so the sum across
      // units exactly matches formData.discountValue (in DZD,
      // integer DA only). Naïve `discountValue / N` lost (N-1) DA
      // to integer-floor on multi-unit fixed discounts. Distribute
      // the rounding remainder across the first units.
      const unitPrices = formData.selectedUnits.map(uid =>
        units.find(u => u.id === uid)?.price ?? 0
      )
      const perUnitDiscount: number[] = unitPrices.map(p => {
        if (formData.discountType === 'percentage') {
          return Math.round((p * formData.discountValue) / 100)
        }
        return 0  // populated below for fixed
      })
      if (formData.discountType === 'fixed' && unitPrices.length > 0) {
        const each = Math.floor(formData.discountValue / unitPrices.length)
        const remainder = formData.discountValue - each * unitPrices.length
        for (let i = 0; i < unitPrices.length; i++) {
          // Front-load the remainder so the first `remainder` units
          // each get +1 DA; total matches formData.discountValue
          // to the DA.
          perUnitDiscount[i] = each + (i < remainder ? 1 : 0)
        }
      }

      // 1. Insert sale for each unit
      for (let unitIdx = 0; unitIdx < formData.selectedUnits.length; unitIdx++) {
        const unitId = formData.selectedUnits[unitIdx]
        const unitPrice = unitPrices[unitIdx]
        const unitDiscount = perUnitDiscount[unitIdx]
        const unitFinal = unitPrice - unitDiscount

        const { data: sale, error: saleErr } = await supabase.from('sales').insert({
          tenant_id: client.tenant_id,
          client_id: client.id,
          agent_id: userId,
          project_id: formData.projectId,
          unit_id: unitId,
          total_price: unitPrice,
          discount_type: formData.discountType || null,
          discount_value: unitDiscount,
          final_price: unitFinal,
          financing_mode: formData.financingMode,
          delivery_date: formData.deliveryDate || null,
          internal_notes: formData.internalNotes || null,
        } as never).select().single()
        if (saleErr) { handleSupabaseError(saleErr); throw saleErr }

        // 2. Payment schedules
        if (formData.installments && schedule.length > 0 && sale) {
          const saleId = (sale as { id: string }).id
          for (const line of schedule) {
            await supabase.from('payment_schedules').insert({
              tenant_id: client.tenant_id,
              sale_id: saleId,
              installment_number: line.number,
              due_date: line.date,
              amount: line.amount,
              description: line.description,
            } as never)
          }
        }

        // 3. Amenities
        if (formData.amenities.length > 0 && sale) {
          const saleId = (sale as { id: string }).id
          for (const a of formData.amenities) {
            await supabase.from('sale_amenities').insert({
              tenant_id: client.tenant_id,
              sale_id: saleId,
              description: a.description,
              price: a.price,
            } as never)
          }
        }
      }

      // 4. Client → vente
      await supabase.from('clients').update({ pipeline_stage: 'vente' } as never).eq('id', client.id)

      // 5. History
      const unitCodes = selectedUnitsData.map(u => u.code).join(', ')
      await supabase.from('history').insert({
        tenant_id: client.tenant_id,
        client_id: client.id,
        agent_id: userId,
        type: 'sale',
        title: `Vente créée : ${unitCodes} — ${formatPriceCompact(finalPrice)}`,
        metadata: { unit_ids: formData.selectedUnits, final_price: finalPrice },
      } as never)

      // 6. Mirror the sale + any internal note into clients.notes so
      // the Notes tab on the client detail page tells the next agent
      // who walks in what was sold and on what terms.
      await appendClientNote(
        client.id,
        `🟢 Vente créée — ${unitCodes} (${formatPriceCompact(finalPrice)})`,
        formData.internalNotes ?? null,
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['units'] })
      qc.invalidateQueries({ queryKey: ['client-detail'] })
      qc.invalidateQueries({ queryKey: ['client-sales'] })
      qc.invalidateQueries({ queryKey: ['pipeline-stats'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success(t('sale_modal.success'))
      handleClose()
    },
  })

  function handleClose() {
    setStep(0)
    setFormData({
      projectId: '', selectedUnits: [], amenities: [],
      discountType: '', discountValue: 0, financingMode: 'comptant', deliveryDate: '',
      installments: false, frequency: 'monthly', downPaymentPct: 30, firstPaymentDate: '', internalNotes: '',
    })
    onClose()
  }

  if (!client) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('sale_modal.title')} size="xl">
      <div className="flex gap-6">
        {/* Left: step content */}
        <div className="min-w-0 flex-1">
          {/* Step bar */}
          <div className="mb-6 flex items-center">
            {STEP_KEYS.map((key, i) => (
              <div key={key} className="flex flex-1 items-center">
                {i > 0 && (
                  <div className={`h-0.5 flex-1 ${i <= step ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`} />
                )}
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      i < step
                        ? 'bg-immo-accent-green text-immo-bg-primary'
                        : i === step
                          ? 'bg-immo-accent-green/15 text-immo-accent-green ring-1 ring-immo-accent-green/40'
                          : 'bg-immo-bg-card-hover text-immo-text-muted'
                    }`}
                  >
                    {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={`mt-1 text-[9px] ${i === step ? 'font-medium text-immo-accent-green' : 'text-immo-text-muted'}`}>
                    {t(key)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Step content */}
          {step === 0 && (
            <Step1Identification
              client={client}
              projects={projects}
              selectedProjectId={formData.projectId}
              onSelectProject={(id) => setFormData((d) => ({ ...d, projectId: id, selectedUnits: [] }))}
            />
          )}
          {step === 1 && (
            <Step2Biens
              units={units}
              selectedUnits={formData.selectedUnits}
              onToggleUnit={(id) =>
                setFormData((d) => ({
                  ...d,
                  selectedUnits: d.selectedUnits.includes(id)
                    ? d.selectedUnits.filter((u) => u !== id)
                    : [...d.selectedUnits, id],
                }))
              }
              amenities={formData.amenities}
              onAddAmenity={(a) => setFormData((d) => ({ ...d, amenities: [...d.amenities, a] }))}
              onRemoveAmenity={(id) => setFormData((d) => ({ ...d, amenities: d.amenities.filter((a) => a.id !== id) }))}
            />
          )}
          {step === 2 && (
            <Step3Finance
              formData={formData}
              grandTotal={grandTotal}
              discountAmount={discountAmount}
              finalPrice={finalPrice}
              defaultDelivery={defaultDelivery}
              onChange={(patch) => setFormData((d) => ({ ...d, ...patch }))}
            />
          )}
          {step === 3 && (
            <Step4Schedule
              formData={formData}
              finalPrice={finalPrice}
              schedule={schedule}
              onChange={(patch) => setFormData((d) => ({ ...d, ...patch }))}
            />
          )}
          {step === 4 && (
            <Step5Validation
              client={client}
              projectName={projectName}
              selectedUnitsData={selectedUnitsData}
              amenities={formData.amenities}
              finalPrice={finalPrice}
              discountAmount={discountAmount}
              schedule={schedule}
              internalNotes={formData.internalNotes}
              onNotesChange={(v) => setFormData((d) => ({ ...d, internalNotes: v }))}
            />
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between border-t border-immo-border-default pt-4">
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => setStep((s) => s - 1)}
                  className="text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary"
                >
                  ← Précédent
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary"
              >
                Annuler
              </Button>
            </div>
            {isLastStep ? (
              <Button
                onClick={() => submitSale.mutate()}
                disabled={submitSale.isPending}
                className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90"
              >
                {submitSale.isPending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-immo-bg-primary border-t-transparent" />
                ) : (
                  'Créer la vente'
                )}
              </Button>
            ) : (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canProceed}
                className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90 disabled:opacity-50"
              >
                Suivant →
              </Button>
            )}
          </div>
        </div>

        {/* Right: recap panel */}
        <div className="w-[260px] shrink-0 space-y-4 rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
          {/* Progress */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-immo-text-muted">{t('sale_modal.progress')}</span>
              <span className="font-semibold text-immo-text-primary">{doneCount}/4</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-immo-bg-primary">
              <div className="h-full bg-immo-accent-green transition-all" style={{ width: `${(doneCount / 4) * 100}%` }} />
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  b.done
                    ? 'bg-immo-accent-green/10 text-immo-accent-green'
                    : 'bg-immo-bg-card-hover text-immo-text-muted'
                }`}
              >
                {b.done && <Check className="h-2.5 w-2.5" />}
                {b.label}
              </span>
            ))}
          </div>

          <div className="h-px bg-immo-border-default" />

          {/* Client */}
          <div>
            <p className="text-[10px] text-immo-text-muted">{t('sale_modal.side_client')}</p>
            <p className="text-xs font-medium text-immo-text-primary">{client.full_name}</p>
          </div>

          {/* Project */}
          {projectName && (
            <div>
              <p className="text-[10px] text-immo-text-muted">{t('sale_modal.side_project')}</p>
              <p className="text-xs font-medium text-immo-text-primary">{projectName}</p>
            </div>
          )}

          {/* Selected units */}
          {selectedUnitsData.length > 0 && (
            <div>
              <p className="text-[10px] text-immo-text-muted">Biens ({selectedUnitsData.length})</p>
              <div className="mt-1 space-y-1">
                {selectedUnitsData.map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-immo-text-secondary">{u.code}</span>
                    <span className="text-immo-text-primary">{u.price != null ? formatPriceCompact(u.price) : '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Amenities */}
          {formData.amenities.length > 0 && (
            <div>
              <p className="text-[10px] text-immo-text-muted">Aménagements ({formData.amenities.length})</p>
              <div className="mt-1 space-y-1">
                {formData.amenities.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-[11px]">
                    <span className="truncate text-immo-text-secondary">{a.description}</span>
                    <span className="text-immo-text-primary">{formatPriceCompact(a.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="h-px bg-immo-border-default" />

          {/* Schedule info */}
          {schedule.length > 0 && (
            <div>
              <p className="text-[10px] text-immo-text-muted">{t('sale_modal.side_installments')}</p>
              <p className="text-xs text-immo-text-primary">{schedule.length} échéances</p>
            </div>
          )}

          <div className="h-px bg-immo-border-default" />

          {/* Total */}
          <div>
            {discountAmount > 0 && (
              <>
                <p className="text-[10px] text-immo-text-muted">Sous-total</p>
                <p className="text-xs text-immo-text-secondary line-through">{formatPriceCompact(grandTotal)}</p>
                <p className="text-[10px] text-immo-status-orange">Remise: -{formatPriceCompact(discountAmount)}</p>
              </>
            )}
            <p className="text-[10px] text-immo-text-muted">{discountAmount > 0 ? 'Prix final' : 'Total'}</p>
            <p className="text-lg font-bold text-immo-accent-green">{formatPriceCompact(finalPrice)}</p>
          </div>

          {/* Ready badge */}
          <div
            className={`rounded-lg px-3 py-2 text-center text-[11px] font-medium ${
              isReady
                ? 'bg-immo-accent-green/10 text-immo-accent-green'
                : 'bg-immo-status-orange-bg text-immo-status-orange'
            }`}
          >
            {isReady ? '✓ Prêt à finaliser' : 'Informations manquantes'}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ═══ Step 1: Identification ═══ */

interface Step1Props {
  client: ClientInfo
  projects: Array<{ id: string; name: string; code: string; status: string }>
  selectedProjectId: string
  onSelectProject: (id: string) => void
}

function Step1Identification({ client, projects, selectedProjectId, onSelectProject }: Step1Props) {
  const [search, setSearch] = useState('')
  const stage = PIPELINE_STAGES[client.pipeline_stage]

  const filtered = useMemo(
    () => projects.filter((p) => {
      if (p.status !== 'active') return false
      if (!search) return true
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    }),
    [projects, search],
  )

  return (
    <div className="space-y-5">
      {/* Client card */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-primary p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-immo-accent-green/15 text-sm font-bold text-immo-accent-green">
            {client.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-immo-text-primary">{client.full_name}</p>
            <div className="mt-0.5 flex items-center gap-3 text-[11px] text-immo-text-muted">
              <span>{client.phone}</span>
              {client.nin_cin && <span>CIN: {client.nin_cin}</span>}
            </div>
          </div>
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: stage.color + '20', color: stage.color }}
          >
            {stage.label}
          </span>
        </div>
      </div>

      {/* Project selection */}
      <div>
        <Label className={labelClass}>Choisir un projet *</Label>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-immo-text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un projet..."
            className={`pl-9 ${inputClass}`}
          />
        </div>
        <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-immo-text-muted">Aucun projet actif</p>
          ) : (
            filtered.map((p) => {
              const selected = selectedProjectId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProject(p.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                    selected
                      ? 'border-immo-accent-green/50 bg-immo-accent-green/5'
                      : 'border-immo-border-default bg-immo-bg-card hover:border-immo-text-muted'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? 'border-immo-accent-green bg-immo-accent-green' : 'border-immo-border-default'
                    }`}
                  >
                    {selected && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <Building2 className="h-4 w-4 shrink-0 text-immo-text-muted" />
                  <div>
                    <p className="text-sm font-medium text-immo-text-primary">{p.name}</p>
                    <p className="text-[11px] text-immo-text-muted">{p.code}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══ Step 2: Biens ═══ */

interface Step2Props {
  units: AvailableUnit[]
  selectedUnits: string[]
  onToggleUnit: (id: string) => void
  amenities: Amenity[]
  onAddAmenity: (a: Amenity) => void
  onRemoveAmenity: (id: string) => void
}

function Step2Biens({ units, selectedUnits, onToggleUnit, amenities, onAddAmenity, onRemoveAmenity }: Step2Props) {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [subTab, setSubTab] = useState<'units' | 'parkings' | 'options'>('units')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showAddAmenity, setShowAddAmenity] = useState(false)

  const regularUnits = useMemo(() => units.filter((u) => u.type !== 'parking'), [units])
  const parkingUnits = useMemo(() => units.filter((u) => u.type === 'parking'), [units])

  const displayedUnits = subTab === 'parkings' ? parkingUnits : regularUnits

  const filtered = useMemo(() => {
    let list = displayedUnits
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((u) => u.code.toLowerCase().includes(q))
    }
    if (typeFilter !== 'all') {
      list = list.filter((u) => u.subtype === typeFilter)
    }
    list = [...list].sort((a, b) => {
      const diff = (a.price ?? 0) - (b.price ?? 0)
      return sortDir === 'asc' ? diff : -diff
    })
    return list
  }, [displayedUnits, search, typeFilter, sortDir])

  const subtypes = useMemo(() => {
    const set = new Set<string>()
    displayedUnits.forEach((u) => { if (u.subtype) set.add(u.subtype) })
    return Array.from(set)
  }, [displayedUnits])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-immo-text-primary">Sélection des biens</h3>
        <p className="text-[11px] text-immo-text-muted">Sélectionnez au moins une unité pour continuer</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-immo-border-default p-0.5">
          {([
            { key: 'units' as const, label: `Unités (${regularUnits.length})` },
            { key: 'parkings' as const, label: `Parkings (${parkingUnits.length})` },
            { key: 'options' as const, label: 'Options' },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                subTab === t.key ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted hover:text-immo-text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {subTab !== 'options' && (
          <div className="flex gap-1 rounded-lg border border-immo-border-default p-0.5">
            <button onClick={() => setView('grid')} className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'}`}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setView('list')} className={`rounded-md p-1.5 ${view === 'list' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'}`}>
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Units / Parkings tab */}
      {subTab !== 'options' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-immo-text-muted" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code..." className={`h-8 w-[150px] pl-8 text-xs ${inputClass}`} />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 rounded-md border border-immo-border-default bg-immo-bg-primary px-2 text-xs text-immo-text-primary"
            >
              <option value="all">Tous sous-types</option>
              {subtypes.map((st) => (
                <option key={st} value={st}>{UNIT_SUBTYPE_LABELS[st as UnitSubtype] ?? st}</option>
              ))}
            </select>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
              className="h-8 rounded-md border border-immo-border-default bg-immo-bg-primary px-2 text-xs text-immo-text-primary"
            >
              <option value="asc">Prix ↑</option>
              <option value="desc">Prix ↓</option>
            </select>
            {selectedUnits.length > 0 && (
              <span className="ml-auto text-[11px] font-medium text-immo-accent-green">
                {selectedUnits.length} sélectionnée(s)
              </span>
            )}
          </div>

          {/* Grid / List */}
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-immo-text-muted">Aucune unité disponible</div>
          ) : view === 'grid' ? (
            <div className="grid max-h-[320px] grid-cols-3 gap-2 overflow-y-auto">
              {filtered.map((u) => {
                const selected = selectedUnits.includes(u.id)
                const isClose = u.delivery_date && differenceInMonths(new Date(u.delivery_date), new Date()) < 6
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => onToggleUnit(u.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? 'border-immo-accent-green/50 bg-immo-accent-green/5'
                        : 'border-immo-border-default bg-immo-bg-card hover:border-immo-text-muted'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-immo-text-primary">{u.code}</span>
                      <div className={`flex h-4 w-4 items-center justify-center rounded border ${
                        selected ? 'border-immo-accent-green bg-immo-accent-green' : 'border-immo-border-default'
                      }`}>
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-immo-text-muted">
                      {UNIT_TYPE_LABELS[u.type]}{u.subtype ? ` ${u.subtype}` : ''} · Ét.{u.floor ?? '-'}
                    </p>
                    {u.surface != null && <p className="text-[11px] text-immo-text-muted">{u.surface} m²</p>}
                    <p className="mt-1 text-xs font-semibold text-immo-text-primary">
                      {u.price != null ? formatPrice(u.price) : '-'}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      {u.delivery_date && (
                        <span className="text-[10px] text-immo-text-muted">{format(new Date(u.delivery_date), 'MM/yyyy')}</span>
                      )}
                      {isClose && (
                        <span className="rounded bg-immo-accent-green-bg px-1 py-0.5 text-[9px] font-medium text-immo-accent-green">Proche</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto rounded-lg border border-immo-border-default">
              <table className="w-full">
                <thead>
                  <tr className="bg-immo-bg-card-hover">
                    <th className="w-8 px-2 py-2" />
                    {['Code', 'Type', 'Étage', 'Surface', 'Prix', 'Livraison'].map((h) => (
                      <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold uppercase text-immo-text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-immo-border-default">
                  {filtered.map((u) => {
                    const selected = selectedUnits.includes(u.id)
                    return (
                      <tr
                        key={u.id}
                        onClick={() => onToggleUnit(u.id)}
                        className={`cursor-pointer transition-colors ${selected ? 'bg-immo-accent-green/5' : 'bg-immo-bg-card hover:bg-immo-bg-card-hover'}`}
                      >
                        <td className="px-2 py-2">
                          <div className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? 'border-immo-accent-green bg-immo-accent-green' : 'border-immo-border-default'}`}>
                            {selected && <Check className="h-3 w-3 text-white" />}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs font-medium text-immo-text-primary">{u.code}</td>
                        <td className="px-2 py-2 text-[11px] text-immo-text-muted">{UNIT_TYPE_LABELS[u.type]}{u.subtype ? ` ${u.subtype}` : ''}</td>
                        <td className="px-2 py-2 text-[11px] text-immo-text-muted">{u.floor ?? '-'}</td>
                        <td className="px-2 py-2 text-[11px] text-immo-text-muted">{u.surface ? `${u.surface}m²` : '-'}</td>
                        <td className="px-2 py-2 text-xs font-medium text-immo-text-primary">{u.price != null ? formatPriceCompact(u.price) : '-'}</td>
                        <td className="px-2 py-2 text-[11px] text-immo-text-muted">{u.delivery_date ? format(new Date(u.delivery_date), 'MM/yyyy') : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Options tab */}
      {subTab === 'options' && (
        <div className="space-y-4">
          <p className="text-xs text-immo-text-muted">Aménagements et options supplémentaires à inclure dans la vente.</p>

          {/* List existing amenities */}
          {amenities.length > 0 && (
            <div className="space-y-2">
              {amenities.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-immo-border-default bg-immo-bg-card px-4 py-2.5">
                  <div>
                    <p className="text-sm text-immo-text-primary">{a.description}</p>
                    <p className="text-xs text-immo-accent-green">{formatPrice(a.price)}</p>
                  </div>
                  <button onClick={() => onRemoveAmenity(a.id)} className="rounded-md p-1 text-immo-text-muted hover:bg-immo-status-red-bg hover:text-immo-status-red">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            onClick={() => setShowAddAmenity(true)}
            className="border border-dashed border-immo-border-default text-xs text-immo-text-secondary hover:border-immo-accent-green hover:text-immo-accent-green"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Ajouter un aménagement
          </Button>

          {/* Add amenity inline form */}
          {showAddAmenity && (
            <AddAmenityForm
              onAdd={(a) => { onAddAmenity(a); setShowAddAmenity(false) }}
              onCancel={() => setShowAddAmenity(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

/* ═══ Add Amenity Form ═══ */

function AddAmenityForm({ onAdd, onCancel }: { onAdd: (a: Amenity) => void; onCancel: () => void }) {
  const [desc, setDesc] = useState('')
  const [price, setPrice] = useState('')

  function handle() {
    if (!desc || !price) return
    onAdd({ id: crypto.randomUUID(), description: desc, price: Number(price) })
    setDesc(''); setPrice('')
  }

  return (
    <div className="rounded-lg border border-immo-accent-green/30 bg-immo-accent-green/5 p-4">
      <div className="space-y-3">
        <div>
          <Label className={labelClass}>Description *</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Cuisine équipée haut de gamme" className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <Label className={labelClass}>Prix (DA) *</Label>
          <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="350000" className={`mt-1 ${inputClass}`} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} className="text-xs text-immo-text-muted">Annuler</Button>
          <Button onClick={handle} disabled={!desc || !price} className="bg-immo-accent-green text-xs font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ═══ Step 3: Finance ═══ */

interface Step3Props {
  formData: SaleFormData
  grandTotal: number
  discountAmount: number
  finalPrice: number
  defaultDelivery: string
  onChange: (patch: Partial<SaleFormData>) => void
}

function Step3Finance({ formData, grandTotal, discountAmount, finalPrice, defaultDelivery, onChange }: Step3Props) {
  return (
    <div className="space-y-6">
      {/* Discount */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-primary p-4">
        <h4 className="mb-3 text-xs font-semibold text-immo-text-primary">Remise commerciale</h4>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 rounded-lg border border-immo-border-default p-0.5">
            <button
              type="button"
              onClick={() => onChange({ discountType: 'percentage', discountValue: formData.discountValue })}
              className={`rounded-md px-3 py-1 text-[11px] font-medium ${formData.discountType === 'percentage' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'}`}
            >
              Pourcentage (%)
            </button>
            <button
              type="button"
              onClick={() => onChange({ discountType: 'fixed', discountValue: formData.discountValue })}
              className={`rounded-md px-3 py-1 text-[11px] font-medium ${formData.discountType === 'fixed' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'}`}
            >
              Montant fixe
            </button>
            {formData.discountType && (
              <button
                type="button"
                onClick={() => onChange({ discountType: '', discountValue: 0 })}
                className="rounded-md px-2 py-1 text-[11px] text-immo-text-muted hover:text-immo-status-red"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {formData.discountType && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={formData.discountValue || ''}
                onChange={(e) => onChange({ discountValue: Number(e.target.value) })}
                placeholder={formData.discountType === 'percentage' ? '10' : '500000'}
                className={`h-9 w-[140px] ${inputClass}`}
              />
              {discountAmount > 0 && (
                <span className="text-xs text-immo-status-orange">-{formatPriceCompact(discountAmount)}</span>
              )}
            </div>
          )}
        </div>
        {discountAmount > 0 && (
          <p className="mt-2 text-xs text-immo-text-muted">
            {formatPriceCompact(grandTotal)} - {formatPriceCompact(discountAmount)} = <span className="font-semibold text-immo-accent-green">{formatPriceCompact(finalPrice)}</span>
          </p>
        )}
      </div>

      {/* Financing mode */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-primary p-4">
        <h4 className="mb-3 text-xs font-semibold text-immo-text-primary">Mode de financement</h4>
        <div className="space-y-2">
          {([
            { value: 'comptant' as FinancingMode, label: 'Comptant', desc: 'Paiement intégral ou échelonné sans crédit' },
            { value: 'credit' as FinancingMode, label: 'Crédit', desc: 'Financement via établissement bancaire ou employeur' },
            { value: 'mixte' as FinancingMode, label: 'Mixte', desc: 'Apport personnel + crédit bancaire' },
          ]).map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => onChange({ financingMode: mode.value })}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                formData.financingMode === mode.value
                  ? 'border-immo-accent-green/50 bg-immo-accent-green/5'
                  : 'border-immo-border-default hover:border-immo-text-muted'
              }`}
            >
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                formData.financingMode === mode.value ? 'border-immo-accent-green bg-immo-accent-green' : 'border-immo-border-default'
              }`}>
                {formData.financingMode === mode.value && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
              <div>
                <p className="text-sm font-medium text-immo-text-primary">{mode.label}</p>
                <p className="text-[11px] text-immo-text-muted">{mode.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Delivery date */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-primary p-4">
        <h4 className="mb-3 text-xs font-semibold text-immo-text-primary">Date de livraison prévue</h4>
        <Input
          type="date"
          value={formData.deliveryDate || defaultDelivery}
          onChange={(e) => onChange({ deliveryDate: e.target.value })}
          className={`w-[200px] ${inputClass}`}
        />
        <p className="mt-2 text-[11px] text-immo-text-muted">L'échéancier sera calculé jusqu'à cette date</p>
      </div>
    </div>
  )
}

/* ═══ Step 4: Schedule ═══ */

interface Step4Props {
  formData: SaleFormData
  finalPrice: number
  schedule: ScheduleLine[]
  onChange: (patch: Partial<SaleFormData>) => void
}

function Step4Schedule({ formData, finalPrice, schedule, onChange }: Step4Props) {
  const downPaymentAmount = Math.round(finalPrice * formData.downPaymentPct / 100)

  return (
    <div className="space-y-5">
      {/* Toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange({ installments: !formData.installments })}
          className="flex items-center gap-2 text-sm font-medium text-immo-text-primary"
        >
          <div className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${formData.installments ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`}>
            <div className={`h-4 w-4 rounded-full bg-white transition-transform ${formData.installments ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          Paiement échelonné
        </button>
      </div>

      {!formData.installments ? (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-primary px-6 py-10 text-center">
          <p className="text-sm text-immo-text-muted">Paiement intégral — pas d'échéancier</p>
          <p className="mt-1 text-lg font-bold text-immo-accent-green">{formatPrice(finalPrice)}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Frequency */}
          <div>
            <Label className={labelClass}>Fréquence des versements</Label>
            <div className="mt-1 flex gap-2">
              {([
                { value: 'monthly' as const, label: 'Mensuel' },
                { value: 'quarterly' as const, label: 'Trimestriel' },
                { value: 'semiannual' as const, label: 'Semestriel' },
              ]).map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => onChange({ frequency: f.value })}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    formData.frequency === f.value
                      ? 'border-immo-accent-green/50 bg-immo-accent-green/10 text-immo-accent-green'
                      : 'border-immo-border-default text-immo-text-muted hover:border-immo-text-muted'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {schedule.length > 0 && (
              <p className="mt-1 text-[11px] text-immo-accent-green">{schedule.length} versements prévus</p>
            )}
          </div>

          {/* Down payment slider */}
          <div>
            <Label className={labelClass}>Apport initial</Label>
            <div className="mt-2 flex items-center gap-4">
              <input
                type="range"
                min={10}
                max={70}
                step={5}
                value={formData.downPaymentPct}
                onChange={(e) => onChange({ downPaymentPct: Number(e.target.value) })}
                className="flex-1 accent-[#00D4A0]"
              />
              <span className="w-[120px] text-right text-xs font-medium text-immo-text-primary">
                {formData.downPaymentPct}% = {formatPriceCompact(downPaymentAmount)}
              </span>
            </div>
          </div>

          {/* First payment date */}
          <div>
            <Label className={labelClass}>Date du premier versement</Label>
            <Input
              type="date"
              value={formData.firstPaymentDate}
              onChange={(e) => onChange({ firstPaymentDate: e.target.value })}
              className={`mt-1 w-[200px] ${inputClass}`}
            />
          </div>

          {/* Schedule preview */}
          {schedule.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-immo-border-default">
              <table className="w-full">
                <thead>
                  <tr className="bg-immo-bg-card-hover">
                    {['#', 'Date', 'Montant', 'Description'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-immo-text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-immo-border-default">
                  {schedule.map((line) => (
                    <tr key={line.number} className={`bg-immo-bg-card ${line.number === 1 ? 'bg-immo-accent-green/5' : ''}`}>
                      <td className="px-3 py-2 text-xs text-immo-text-muted">{line.number}</td>
                      <td className="px-3 py-2 text-xs text-immo-text-primary">{format(new Date(line.date), 'dd/MM/yyyy')}</td>
                      <td className="px-3 py-2 text-xs font-medium text-immo-text-primary">{formatPrice(line.amount)}</td>
                      <td className="px-3 py-2 text-xs text-immo-text-muted">{line.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {formData.deliveryDate && (
            <p className="text-[11px] text-immo-text-muted">
              Le dernier versement est prévu pour le <span className="font-medium text-immo-text-primary">{format(new Date(formData.deliveryDate), 'dd/MM/yyyy')}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══ Step 5: Validation ═══ */

interface Step5Props {
  client: ClientInfo
  projectName: string
  selectedUnitsData: AvailableUnit[]
  amenities: Amenity[]
  finalPrice: number
  discountAmount: number
  schedule: ScheduleLine[]
  internalNotes: string
  onNotesChange: (v: string) => void
}

function Step5Validation({ client, projectName, selectedUnitsData, amenities, finalPrice, discountAmount, schedule, internalNotes, onNotesChange }: Step5Props) {
  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="flex items-center gap-3 rounded-xl border border-immo-accent-green/30 bg-immo-accent-green/5 px-4 py-3">
        <CheckCircle className="h-5 w-5 text-immo-accent-green" />
        <p className="text-sm font-medium text-immo-accent-green">Prêt à finaliser</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Recap */}
        <div className="space-y-4">
          {/* Identification */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase text-immo-text-muted">Identification</p>
            <div className="rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
              <p className="text-sm text-immo-text-primary">{client.full_name}</p>
              <p className="text-xs text-immo-text-muted">{projectName}</p>
            </div>
          </div>

          {/* Units */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase text-immo-text-muted">Biens sélectionnés</p>
            <div className="rounded-lg border border-immo-border-default bg-immo-bg-primary">
              {selectedUnitsData.map((u, i) => (
                <div key={u.id} className={`flex items-center justify-between px-3 py-2 ${i > 0 ? 'border-t border-immo-border-default' : ''}`}>
                  <div>
                    <span className="text-xs font-medium text-immo-text-primary">{u.code}</span>
                    <span className="ml-2 text-[11px] text-immo-text-muted">{UNIT_TYPE_LABELS[u.type]}{u.subtype ? ` ${u.subtype}` : ''}</span>
                  </div>
                  <span className="text-xs font-medium text-immo-text-primary">{u.price != null ? formatPrice(u.price) : '-'}</span>
                </div>
              ))}
              {amenities.map((a) => (
                <div key={a.id} className="flex items-center justify-between border-t border-immo-border-default px-3 py-2">
                  <span className="text-xs text-immo-text-muted">{a.description}</span>
                  <span className="text-xs text-immo-text-primary">{formatPrice(a.price)}</span>
                </div>
              ))}
              {discountAmount > 0 && (
                <div className="flex items-center justify-between border-t border-immo-border-default px-3 py-2">
                  <span className="text-xs text-immo-status-orange">Remise</span>
                  <span className="text-xs text-immo-status-orange">-{formatPrice(discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-immo-accent-green/30 bg-immo-accent-green/5 px-3 py-2.5">
                <span className="text-xs font-semibold text-immo-accent-green">Total</span>
                <span className="text-sm font-bold text-immo-accent-green">{formatPrice(finalPrice)}</span>
              </div>
            </div>
          </div>

          {/* Schedule summary */}
          {schedule.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase text-immo-text-muted">Échéancier</p>
              <div className="rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-xs">
                <div className="flex justify-between text-immo-text-muted">
                  <span>Premier versement</span>
                  <span className="text-immo-text-primary">{formatPriceCompact(schedule[0].amount)} — {format(new Date(schedule[0].date), 'dd/MM/yyyy')}</span>
                </div>
                <div className="mt-1 flex justify-between text-immo-text-muted">
                  <span>Dernier versement</span>
                  <span className="text-immo-text-primary">{formatPriceCompact(schedule[schedule.length - 1].amount)} — {format(new Date(schedule[schedule.length - 1].date), 'dd/MM/yyyy')}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Documents + Notes */}
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase text-immo-text-muted">Documents à générer</p>
            <div className="space-y-2">
              {[
                { name: 'Contrat de Vente', required: true },
                { name: 'Échéancier de Paiement', required: false },
                { name: 'Bon de Réservation', required: false },
              ].map((doc) => (
                <div key={doc.name} className="flex items-center justify-between rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-immo-accent-blue" />
                    <span className="text-xs text-immo-text-primary">{doc.name}</span>
                    {doc.required && (
                      <span className="rounded bg-immo-status-orange-bg px-1.5 py-0.5 text-[9px] font-medium text-immo-status-orange">REQUIS</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button className="rounded p-1 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-accent-blue" title="Aperçu">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded p-1 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-accent-green" title="Télécharger">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded p-1 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary" title="Imprimer">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase text-immo-text-muted">Notes internes</p>
            <textarea
              value={internalNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Notes internes sur cette vente..."
              rows={4}
              className={`w-full resize-none rounded-lg border p-3 text-sm focus:outline-none focus:ring-1 focus:ring-immo-accent-green ${inputClass}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
