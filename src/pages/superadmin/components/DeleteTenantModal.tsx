import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

interface DeleteTenantModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tenant: { id: string; name: string } | null
}

export function DeleteTenantModal({ isOpen, onClose, onSuccess, tenant }: DeleteTenantModalProps) {
  const [confirmName, setConfirmName] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setConfirmName('')
      setReason('')
    }
  }, [isOpen, tenant?.id])

  if (!tenant) return null

  const matches = confirmName.trim() === tenant.name
  const canSubmit = matches && !loading

  async function handleDelete() {
    if (!matches || !tenant) return
    setLoading(true)
    try {
      const { error } = await supabase.rpc('soft_delete_tenant' as never, {
        p_tenant_id: tenant.id,
        p_confirmation_name: confirmName.trim(),
        p_reason: reason.trim() || null,
      } as never)
      if (error) throw error
      toast.success(`Tenant « ${tenant.name} » supprimé`)
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Echec de la suppression'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Supprimer le tenant"
      subtitle={tenant.name}
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-immo-status-red/30 bg-immo-status-red/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-immo-status-red" />
          <div className="space-y-1.5 text-xs text-immo-text-primary">
            <p className="font-semibold text-immo-status-red">Action irréversible côté UI</p>
            <p className="text-immo-text-secondary">
              Le tenant sera marqué comme <strong>supprimé</strong> et disparaîtra immédiatement
              de la liste, des KPIs et de tous les écrans de l'application. Ses données restent
              en base (clients, projets, ventes…) pour archive comptable et possible
              réactivation manuelle ultérieure via SQL.
            </p>
            <p className="text-immo-text-secondary">
              Pour confirmer, écris exactement le nom du tenant ci-dessous.
            </p>
          </div>
        </div>

        <div>
          <Label className="text-[11px] font-medium text-immo-text-secondary">
            Nom à confirmer : <span className="font-mono text-immo-status-red">{tenant.name}</span>
          </Label>
          <Input
            value={confirmName}
            onChange={e => setConfirmName(e.target.value)}
            disabled={loading}
            autoFocus
            placeholder={tenant.name}
            className={`mt-1 border-immo-border-default bg-immo-bg-card text-sm ${
              matches ? 'border-immo-accent-green/50' : confirmName ? 'border-immo-status-red/50' : ''
            }`}
          />
          {confirmName && !matches && (
            <p className="mt-1 text-[10px] text-immo-status-red">
              Le nom ne correspond pas exactement.
            </p>
          )}
        </div>

        <div>
          <Label className="text-[11px] font-medium text-immo-text-secondary">
            Raison (optionnelle, conservée dans l'audit)
          </Label>
          <Input
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={loading}
            placeholder="Ex: doublon, demande client, fin de contrat…"
            maxLength={200}
            className="mt-1 border-immo-border-default bg-immo-bg-card text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-immo-border-default pt-4">
          <Button
            onClick={onClose}
            disabled={loading}
            className="border border-immo-border-default bg-transparent text-immo-text-secondary hover:bg-immo-bg-card-hover"
          >
            Annuler
          </Button>
          <Button
            onClick={handleDelete}
            disabled={!canSubmit}
            className="bg-immo-status-red font-semibold text-white hover:bg-immo-status-red/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
            Supprimer définitivement
          </Button>
        </div>
      </div>
    </Modal>
  )
}
