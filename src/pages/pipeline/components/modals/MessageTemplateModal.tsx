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
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Envoyer un message" subtitle={clientName} size="md">
      <MessageComposer
        vars={{ clientName, clientPhone, agentName, agencyName, projectName }}
        defaultTemplateId="relance"
      />
    </Modal>
  )
}
