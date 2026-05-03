import { useState, lazy, Suspense } from 'react'
import {
  Phone, PhoneCall, MessageCircle, MessageSquare,
  Mail, Bot, Calendar, UserCheck, Lock,
} from 'lucide-react'
// Lazy-load modals — they add bundle weight to every ClientDetailPage visit
// and most users never trigger all three.
const CallLogModal = lazy(() => import('./modals/CallLogModal').then(m => ({ default: m.CallLogModal })))
const CallScriptModal = lazy(() => import('./modals/CallScriptModal').then(m => ({ default: m.CallScriptModal })))
const MessageTemplateModal = lazy(() => import('./modals/MessageTemplateModal').then(m => ({ default: m.MessageTemplateModal })))
import type { PipelineStage } from '@/types'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'

interface QuickActionsProps {
  clientId: string
  clientName: string
  clientPhone: string
  clientEmail?: string | null
  clientStage?: PipelineStage
  tenantId: string
  agentId: string
  agentName?: string
  projectName?: string
  onAction: (action: string) => void
  onOpenVisit?: () => void
  onOpenAI?: () => void
  onOpenReassign?: () => void
}

export function QuickActions({
  clientId, clientName, clientPhone, clientEmail, clientStage,
  tenantId, agentId, agentName, projectName,
  onAction, onOpenVisit, onOpenAI, onOpenReassign,
}: QuickActionsProps) {
  const [showCallLog, setShowCallLog] = useState(false)
  const [showCallScript, setShowCallScript] = useState(false)
  const [showMessage, setShowMessage] = useState(false)

  // Plan / tenant gate for the Suggestions AI button — Free/Starter
  // tenants don't have ai_suggestions in plan_limits.features, so we
  // disable the button up front rather than letting them open the
  // modal and hit a 403 inside rankWithAI.
  const aiAccess = useFeatureAccess('ai_suggestions')

  const phone = clientPhone.replace(/[\s\-\(\)]/g, '').replace(/^0/, '213')

  function handleAction(key: string) {
    switch (key) {
      case 'call':
        // Open guided call script modal
        window.open(`tel:${clientPhone}`, '_self')
        setShowCallScript(true)
        break

      case 'whatsapp_call':
        // Open WhatsApp call
        window.open(`https://wa.me/${phone}`, '_blank')
        onAction('whatsapp_call')
        break

      case 'whatsapp_message':
        // Open message template modal → WhatsApp
        setShowMessage(true)
        break

      case 'sms':
        // Open SMS app
        window.open(`sms:${clientPhone}`, '_self')
        onAction('sms')
        break

      case 'email':
        // Open email client
        if (clientEmail) {
          window.open(`mailto:${clientEmail}`, '_self')
        }
        onAction('email')
        break

      case 'ai_task':
        onOpenAI?.()
        break

      case 'visit_planned':
        onOpenVisit?.()
        break

      case 'reassign':
        onOpenReassign?.()
        break

      default:
        onAction(key)
    }
  }

  const aiLockedReason =
    aiAccess.reason === 'plan'
      ? 'Suggestions IA — disponible à partir du plan Pro'
      : aiAccess.reason === 'tenant'
        ? 'Suggestions IA désactivées par votre administrateur'
        : null

  const ACTIONS = [
    { key: 'call', icon: Phone, label: 'Appeler', color: 'text-immo-accent-blue' },
    { key: 'whatsapp_call', icon: PhoneCall, label: 'Appel WA', color: 'text-[#25D366]' },
    { key: 'whatsapp_message', icon: MessageCircle, label: 'Message WA', color: 'text-[#25D366]' },
    { key: 'sms', icon: MessageSquare, label: 'SMS', color: 'text-immo-accent-blue' },
    { key: 'email', icon: Mail, label: 'Email', color: 'text-immo-status-orange', disabled: !clientEmail },
    {
      key: 'ai_task',
      icon: Bot,
      label: 'Suggestions AI',
      color: 'text-blue-400',
      disabled: !aiAccess.allowed && !aiAccess.isLoading,
      title: aiLockedReason ?? undefined,
      locked: !aiAccess.allowed && !aiAccess.isLoading,
    },
    { key: 'visit_planned', icon: Calendar, label: 'Visite', color: 'text-immo-accent-blue' },
    { key: 'reassign', icon: UserCheck, label: 'Reassigner', color: 'text-immo-text-secondary' },
  ] as const

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(({ key, icon: Icon, label, color, ...rest }) => {
          const disabled = 'disabled' in rest && rest.disabled
          const locked = 'locked' in rest && rest.locked
          const title = 'title' in rest ? rest.title : undefined
          return (
            <button
              key={key}
              onClick={() => handleAction(key)}
              disabled={disabled}
              title={title}
              className="relative flex items-center gap-2 rounded-lg border border-immo-border-default bg-immo-bg-card px-3 py-2 text-xs transition-colors hover:border-immo-border-glow/30 hover:bg-immo-bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-immo-text-secondary">{label}</span>
              {locked && <Lock className="h-3 w-3 text-immo-text-muted" />}
            </button>
          )
        })}
      </div>

      {/* Lazy modals — chunk fetched only when opened */}
      <Suspense fallback={null}>
        {showCallScript && (
          <CallScriptModal
            isOpen={showCallScript}
            onClose={() => setShowCallScript(false)}
            clientId={clientId}
            clientName={clientName}
            clientPhone={clientPhone}
            clientStage={clientStage ?? 'accueil'}
            tenantId={tenantId}
            agentId={agentId}
          />
        )}
        {showCallLog && (
          <CallLogModal
            isOpen={showCallLog}
            onClose={() => setShowCallLog(false)}
            clientId={clientId}
            clientName={clientName}
            tenantId={tenantId}
            agentId={agentId}
          />
        )}
        {showMessage && (
          <MessageTemplateModal
            isOpen={showMessage}
            onClose={() => setShowMessage(false)}
            clientName={clientName}
            clientPhone={clientPhone}
            agentName={agentName}
            projectName={projectName}
          />
        )}
      </Suspense>
    </>
  )
}
