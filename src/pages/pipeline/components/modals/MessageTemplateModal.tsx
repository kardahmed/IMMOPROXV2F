import { useTranslation } from 'react-i18next'
import { Modal, MessageComposer } from '@/components/common'

interface MessageTemplateModalProps {
  isOpen: boolean
  onClose: () => void
  clientName: string
  clientPhone: string
  agentName?: string
  agencyName?: string
  projectName?: string
}

export function MessageTemplateModal({
  isOpen, onClose, clientName, clientPhone,
  agentName, agencyName, projectName,
}: MessageTemplateModalProps) {
  const { t } = useTranslation()
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('message_modal.title')} subtitle={clientName} size="md">
      <MessageComposer
        vars={{ clientName, clientPhone, agentName, agencyName, projectName }}
        defaultTemplateId="relance"
      />
    </Modal>
  )
}
