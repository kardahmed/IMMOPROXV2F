import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  clientId: string
  currentAgentId: string | null
  tenantId: string
}

export function ReassignModal({ isOpen, onClose, clientId, currentAgentId, tenantId }: Props) {
  const { t } = useTranslation()
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()
  const [selectedAgent, setSelectedAgent] = useState(currentAgentId ?? '')

  const { data: agents = [] } = useQuery({
    queryKey: ['agents-reassign', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name, email')
        .eq('tenant_id', tenantId).in('role', ['agent', 'admin']).eq('status', 'active').order('first_name')
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string; email: string }>
    },
    enabled: isOpen,
  })

  const reassign = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) return
      const { error } = await supabase.from('clients').update({ agent_id: selectedAgent } as never).eq('id', clientId)
      if (error) { handleSupabaseError(error); throw error }

      const newAgent = agents.find(a => a.id === selectedAgent)
      const fullName = `${newAgent?.first_name ?? ''} ${newAgent?.last_name ?? ''}`.trim()
      await supabase.from('history').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: userId,
        type: 'note',
        title: t('reassign_modal.history_title', { name: fullName }),
      } as never)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-detail'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(t('reassign_modal.success'))
      onClose()
    },
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('reassign_modal.title')} size="sm">
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-immo-text-muted mb-1">{t('reassign_modal.new_agent')}</Label>
          <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
            className="h-10 w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
            <option value="">{t('reassign_modal.select_agent')}</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.first_name} {a.last_name} {a.id === currentAgentId ? t('reassign_modal.current_suffix') : ''}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={() => reassign.mutate()} disabled={!selectedAgent || selectedAgent === currentAgentId || reassign.isPending}
          className="w-full bg-immo-accent-green text-white">
          <UserCheck className="me-1.5 h-4 w-4" /> {t('reassign_modal.reassign')}
        </Button>
      </div>
    </Modal>
  )
}
