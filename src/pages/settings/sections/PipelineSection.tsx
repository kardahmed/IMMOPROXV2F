import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { PIPELINE_STAGES } from '@/types'
import { PIPELINE_ORDER } from '@/lib/constants'
import toast from 'react-hot-toast'
import { SectionHeader, Field, SaveButton, inputClass } from './shared'

export function PipelineSection() {
  const { t } = useTranslation()
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['tenant-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId!).single()
      return data as Record<string, unknown> | null
    },
    enabled: !!tenantId,
  })

  const [urgentDays, setUrgentDays] = useState('7')
  const [relaunchDays, setRelaunchDays] = useState('3')

  useEffect(() => {
    if (settings) {
      setUrgentDays(String(settings.urgent_alert_days ?? 7))
      setRelaunchDays(String(settings.relaunch_alert_days ?? 3))
    }
  }, [settings])

  const save = useMutation({
    mutationFn: async () => {
      if (settings) {
        await supabase.from('tenant_settings').update({ urgent_alert_days: Number(urgentDays), relaunch_alert_days: Number(relaunchDays) } as never).eq('tenant_id', tenantId!)
      } else {
        await supabase.from('tenant_settings').insert({ tenant_id: tenantId, urgent_alert_days: Number(urgentDays), relaunch_alert_days: Number(relaunchDays) } as never)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-settings'] }); toast.success(t('success.saved')) },
  })

  return (
    <div className="space-y-5">
      <SectionHeader title={t('nav.pipeline')} subtitle={t('page.pipeline_subtitle')} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Urgent (jours)"><Input type="number" value={urgentDays} onChange={e => setUrgentDays(e.target.value)} className={inputClass} /></Field>
        <Field label="Relance (jours)"><Input type="number" value={relaunchDays} onChange={e => setRelaunchDays(e.target.value)} className={inputClass} /></Field>
      </div>
      <Separator className="bg-immo-border-default" />
      <h4 className="text-xs font-semibold text-immo-text-primary">{t('field.stage')}</h4>
      <div className="space-y-2">
        {PIPELINE_ORDER.map((stage, i) => {
          const meta = PIPELINE_STAGES[stage]
          return (
            <div key={stage} className="flex items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2">
              <span className="text-xs text-immo-text-muted">{i + 1}</span>
              <span className="h-3 w-3 rounded-full" style={{ background: meta.color }} />
              <span className="flex-1 text-sm text-immo-text-primary">{meta.label}</span>
              {/* Audit (HIGH): the color input had no onChange handler
                  so editing did nothing — UI ment. Removed until per-
                  tenant stage colors are actually wired through DB. */}
            </div>
          )
        })}
      </div>
      <SaveButton onClick={() => save.mutate()} loading={save.isPending} />
    </div>
  )
}
