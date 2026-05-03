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
      if (!targetId) throw new Error('Sélectionnez un tenant cible')

      // Audit (HIGH): the previous version ran 6+ sequential awaits
      // (settings select / upsert / templates select / per-template
      // upsert / log). A failure mid-flight left the target tenant
      // with a partial config. The atomic RPC (migration 051) wraps
      // everything in a single Postgres transaction.
      const { error } = await supabase.rpc('duplicate_tenant_config_atomic' as never, {
        p_source_tenant_id: sourceTenantId,
        p_target_tenant_id: targetId,
        p_copy_settings: copySettings,
        p_copy_templates: copyTemplates,
        p_copy_pipeline: copyPipeline,
      } as never)
      if (error) { handleSupabaseError(error); throw error }
      // Note: source_tenant_name is logged inside the RPC's
      // super_admin_logs row via auth.uid(), but we don't pass it
      // explicitly. The audit row carries the IDs only.
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
            variant="blue"
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
          checked ? 'border-[#0579DA] bg-[#0579DA]' : 'border-immo-border-default'
        }`}
      >
        {checked && <span className="text-[10px] text-white">&#10003;</span>}
      </div>
      <span className="text-xs text-immo-text-secondary">{label}</span>
    </label>
  )
}
