import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import toast from 'react-hot-toast'

interface DuplicateConfigModalProps {
  isOpen: boolean
  onClose: () => void
  sourceTenantId: string
  sourceTenantName: string
}

export function DuplicateConfigModal({ isOpen, onClose, sourceTenantId, sourceTenantName }: DuplicateConfigModalProps) {
  const [targetId, setTargetId] = useState('')
  const [copySettings, setCopySettings] = useState(true)
  const [copyTemplates, setCopyTemplates] = useState(true)
  const [copyPipeline, setCopyPipeline] = useState(true)
  const qc = useQueryClient()

  // Fetch all tenants except source
  const { data: tenants = [] } = useQuery({
    queryKey: ['all-tenants-for-dup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('id, name').neq('id', sourceTenantId).order('name')
      if (error) { handleSupabaseError(error); throw error }
      return data as Array<{ id: string; name: string }>
    },
    enabled: isOpen,
  })

  const duplicate = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error('Selectionnez un tenant cible')

      // 1. Copy tenant_settings
      if (copySettings || copyPipeline) {
        const { data: sourceSettings } = await supabase
          .from('tenant_settings')
          .select('*')
          .eq('tenant_id', sourceTenantId)
          .single()

        if (sourceSettings) {
          const settingsPayload: Record<string, unknown> = {}
          if (copySettings) {
            settingsPayload.reservation_duration_days = sourceSettings.reservation_duration_days
            settingsPayload.min_deposit_amount = sourceSettings.min_deposit_amount
            settingsPayload.notif_agent_inactive = sourceSettings.notif_agent_inactive
            settingsPayload.notif_payment_late = sourceSettings.notif_payment_late
            settingsPayload.notif_reservation_expired = sourceSettings.notif_reservation_expired
            settingsPayload.notif_new_client = sourceSettings.notif_new_client
            settingsPayload.notif_new_sale = sourceSettings.notif_new_sale
            settingsPayload.notif_goal_achieved = sourceSettings.notif_goal_achieved
          }
          if (copyPipeline) {
            settingsPayload.urgent_alert_days = sourceSettings.urgent_alert_days
            settingsPayload.relaunch_alert_days = sourceSettings.relaunch_alert_days
          }

          // Check if target already has settings
          const { data: existing } = await supabase.from('tenant_settings').select('id').eq('tenant_id', targetId).single()
          if (existing) {
            await supabase.from('tenant_settings').update(settingsPayload as never).eq('tenant_id', targetId)
          } else {
            await supabase.from('tenant_settings').insert({ tenant_id: targetId, ...settingsPayload } as never)
          }
        }
      }

      // 2. Copy document_templates
      if (copyTemplates) {
        const { data: sourceTemplates } = await supabase
          .from('document_templates')
          .select('type, content')
          .eq('tenant_id', sourceTenantId)

        if (sourceTemplates && sourceTemplates.length > 0) {
          for (const tpl of sourceTemplates) {
            const { data: existingTpl } = await supabase
              .from('document_templates')
              .select('id')
              .eq('tenant_id', targetId)
              .eq('type', tpl.type)
              .single()

            if (existingTpl) {
              await supabase.from('document_templates').update({ content: tpl.content } as never).eq('id', existingTpl.id)
            } else {
              await supabase.from('document_templates').insert({
                tenant_id: targetId, type: tpl.type, content: tpl.content,
              } as never)
            }
          }
        }
      }

      // 3. Log action
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await supabase.from('super_admin_logs').insert({
          super_admin_id: session.user.id,
          action: 'duplicate_config',
          tenant_id: targetId,
          details: {
            source_tenant_id: sourceTenantId,
            source_tenant_name: sourceTenantName,
            copied: { settings: copySettings, templates: copyTemplates, pipeline: copyPipeline },
          },
        } as never)
      }
    },
    onSuccess: () => {
      const targetName = tenants.find(t => t.id === targetId)?.name ?? targetId
      toast.success(`Configuration copiee vers ${targetName}`)
      qc.invalidateQueries({ queryKey: ['super-admin-tenant-settings'] })
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Dupliquer la configuration"
      subtitle={`Source : ${sourceTenantName}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary">Annuler</Button>
          <Button
            onClick={() => duplicate.mutate()}
            disabled={!targetId || (!copySettings && !copyTemplates && !copyPipeline) || duplicate.isPending}
            variant="purple"
          >
            {duplicate.isPending
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <><Copy className="mr-1.5 h-4 w-4" /> Dupliquer</>
            }
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Target tenant */}
        <div>
          <Label className="text-[11px] font-medium text-immo-text-secondary">Tenant cible *</Label>
          <Select value={targetId} onValueChange={v => { if (v) setTargetId(v) }}>
            <SelectTrigger className="border-immo-border-default bg-immo-bg-card text-immo-text-primary">
              <SelectValue placeholder="Selectionner un tenant..." />
            </SelectTrigger>
            <SelectContent className="border-immo-border-default bg-immo-bg-card">
              {tenants.map(t => (
                <SelectItem key={t.id} value={t.id} className="text-immo-text-primary focus:bg-immo-bg-card-hover">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* What to copy */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-immo-text-secondary">Elements a copier :</p>
          <CheckboxRow label="Parametres reservation (duree, acompte min)" checked={copySettings} onChange={setCopySettings} />
          <CheckboxRow label="Configuration pipeline (alertes urgentes, relance)" checked={copyPipeline} onChange={setCopyPipeline} />
          <CheckboxRow label="Templates documents (contrat, echeancier, bon)" checked={copyTemplates} onChange={setCopyTemplates} />
        </div>

        <p className="text-[11px] text-immo-status-orange">
          Les parametres existants du tenant cible seront ecrases.
        </p>
      </div>
    </Modal>
  )
}

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-immo-border-default px-3 py-2.5 hover:bg-immo-bg-card-hover">
      <div
        onClick={() => onChange(!checked)}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked ? 'border-[#7C3AED] bg-[#7C3AED]' : 'border-immo-border-default'
        }`}
      >
        {checked && <span className="text-[10px] text-white">&#10003;</span>}
      </div>
      <span className="text-xs text-immo-text-secondary">{label}</span>
    </label>
  )
}
