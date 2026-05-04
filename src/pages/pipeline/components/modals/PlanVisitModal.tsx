import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, MapPin, Building2, Video } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { appendClientNote } from '@/lib/clientNotes'
import { useAuthStore } from '@/store/authStore'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'
import toast from 'react-hot-toast'

const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']

const VISIT_TYPES = [
  { value: 'on_site', i18nKey: 'plan_visit.type_on_site', icon: MapPin },
  { value: 'office', i18nKey: 'plan_visit.type_office', icon: Building2 },
  { value: 'virtual', i18nKey: 'plan_visit.type_virtual', icon: Video },
] as const

interface ClientInfo {
  id: string
  full_name: string
  phone: string
  pipeline_stage: PipelineStage
  tenant_id: string
}

interface PlanVisitModalProps {
  isOpen: boolean
  onClose: () => void
  client: ClientInfo | null
  prefillDate?: string
  prefillTime?: string
  prefillType?: string
  prefillNotes?: string
}

export function PlanVisitModal({
  isOpen,
  onClose,
  client,
  prefillDate = '',
  prefillTime = '',
  prefillType = 'on_site',
  prefillNotes = '',
}: PlanVisitModalProps) {
  const { t } = useTranslation()
  const [date, setDate] = useState(prefillDate)
  const [selectedSlot, setSelectedSlot] = useState(prefillTime)
  const [customTime, setCustomTime] = useState('')
  const [visitType, setVisitType] = useState(prefillType)
  const [notes, setNotes] = useState(prefillNotes)

  const userId = useAuthStore((s) => s.session?.user?.id)
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const [selectedClientId, setSelectedClientId] = useState('')

  // Fetch clients list when no client is provided (planning page use case)
  const { data: clientsList = [] } = useQuery({
    queryKey: ['clients-for-visit', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, full_name, phone, pipeline_stage, tenant_id').eq('tenant_id', tenantId!).order('full_name')
      return (data ?? []) as ClientInfo[]
    },
    enabled: !client && !!tenantId,
  })

  const effectiveClient = client ?? clientsList.find(c => c.id === selectedClientId) ?? null

  const effectiveTime = customTime || selectedSlot

  const mutation = useMutation({
    mutationFn: async () => {
      if (!effectiveClient || !userId || !date || !effectiveTime) return

      const scheduledAt = `${date}T${effectiveTime}:00`

      // 1. Create visit
      const { error: visitErr } = await supabase.from('visits').insert({
        tenant_id: effectiveClient.tenant_id,
        client_id: effectiveClient.id,
        agent_id: userId,
        scheduled_at: scheduledAt,
        visit_type: visitType,
        notes: notes || null,
      } as never)
      if (visitErr) { handleSupabaseError(visitErr); throw visitErr }

      // 2. Move client to visite_a_gerer (if still in earlier stages)
      const earlyStages: PipelineStage[] = ['accueil']
      if (earlyStages.includes(effectiveClient.pipeline_stage)) {
        await supabase.from('clients').update({ pipeline_stage: 'visite_a_gerer' } as never).eq('id', effectiveClient.id)
      }

      // 3. History entry
      const { error: histErr } = await supabase.from('history').insert({
        tenant_id: effectiveClient.tenant_id,
        client_id: effectiveClient.id,
        agent_id: userId,
        type: 'visit_planned',
        title: t('plan_visit.history_title', { date, time: effectiveTime }),
        metadata: { visit_type: visitType, scheduled_at: scheduledAt },
      } as never)
      if (histErr) { handleSupabaseError(histErr); throw histErr }

      // 4. Mirror in clients.notes so the Notes tab keeps the
      // chronological context even when agents rotate.
      await appendClientNote(
        effectiveClient.id,
        t('plan_visit.note_marker', { date, time: effectiveTime, type: visitType }),
        notes,
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-visits'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client-history'] })
      qc.invalidateQueries({ queryKey: ['client-detail'] })
      toast.success(t('plan_visit.success'))
      resetAndClose()
    },
  })

  function resetAndClose() {
    setDate(''); setSelectedSlot(''); setCustomTime(''); setVisitType('on_site'); setNotes('')
    onClose()
  }

  const displayClient = effectiveClient

  const stage = displayClient ? PIPELINE_STAGES[displayClient.pipeline_stage] : null
  const nextStage = displayClient?.pipeline_stage === 'accueil' ? PIPELINE_STAGES.visite_a_gerer : null

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title={t('plan_visit.title')} size="md">
      <div className="space-y-5">
        {/* Client selector (when no client provided) */}
        {!client && (
          <div>
            <Label className="mb-1 text-[11px] font-medium text-immo-text-secondary">{t('plan_visit.client')}</Label>
            <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
              className="h-10 w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
              <option value="">{t('plan_visit.select_client')}</option>
              {clientsList.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}
            </select>
          </div>
        )}

        {/* Client mini-card */}
        {displayClient && (
        <div className="flex items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-immo-accent-green/15 text-sm font-bold text-immo-accent-green">
            {displayClient.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-immo-text-primary">{displayClient.full_name}</p>
            <p className="text-[11px] text-immo-text-muted">{displayClient.phone}</p>
          </div>
          {stage && (
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: stage.color + '20', color: stage.color }}
            >
              {stage.label}
            </span>
            {nextStage && (
              <>
                <span className="text-[10px] text-immo-text-muted">→</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: nextStage.color + '20', color: nextStage.color }}
                >
                  {nextStage.label}
                </span>
              </>
            )}
          </div>
          )}
        </div>
        )}

        {/* Date */}
        <div>
          <Label className="text-[11px] font-medium text-immo-text-muted">{t('plan_visit.desired_date')}</Label>
          <div className="mt-1 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-immo-text-muted" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="border-immo-border-default bg-immo-bg-primary text-immo-text-primary"
            />
          </div>
        </div>

        {/* Time slots */}
        <div>
          <Label className="text-[11px] font-medium text-immo-text-muted">{t('plan_visit.desired_time')}</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TIME_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => { setSelectedSlot(slot); setCustomTime('') }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedSlot === slot && !customTime
                    ? 'border-immo-accent-green bg-immo-accent-green/10 text-immo-accent-green'
                    : 'border-immo-border-default text-immo-text-muted hover:border-immo-text-muted hover:text-immo-text-secondary'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-immo-text-muted">{t('plan_visit.or_custom')}</span>
            <Input
              type="time"
              value={customTime}
              onChange={(e) => { setCustomTime(e.target.value); setSelectedSlot('') }}
              className="w-[120px] border-immo-border-default bg-immo-bg-primary text-immo-text-primary"
            />
          </div>
        </div>

        {/* Visit type */}
        <div>
          <Label className="text-[11px] font-medium text-immo-text-muted">{t('plan_visit.visit_type')}</Label>
          <div className="mt-2 flex gap-3">
            {VISIT_TYPES.map(({ value, i18nKey, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setVisitType(value)}
                className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                  visitType === value
                    ? 'border-immo-accent-green bg-immo-accent-green/5 text-immo-accent-green'
                    : 'border-immo-border-default text-immo-text-muted hover:border-immo-text-muted'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{t(i18nKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label className="text-[11px] font-medium text-immo-text-muted">{t('plan_visit.notes_optional')}</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('plan_visit.notes_placeholder')}
            rows={2}
            className="mt-1 w-full resize-none rounded-md border border-immo-border-default bg-immo-bg-primary p-2.5 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:outline-none focus:ring-1 focus:ring-immo-accent-green"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-immo-border-default pt-4">
          <Button
            variant="ghost"
            onClick={resetAndClose}
            className="text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary"
          >
            {t('plan_visit.cancel')}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!date || !effectiveTime || mutation.isPending}
            className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90"
          >
            {mutation.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-immo-bg-primary border-t-transparent" />
            ) : (
              <>
                <CalendarDays className="me-1.5 h-4 w-4" />
                {t('plan_visit.plan_visit')}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
