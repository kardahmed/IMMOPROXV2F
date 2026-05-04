// Shared message composer — used by TaskDetailModal (/tasks) and
// MessageTemplateModal (/pipeline client detail). Pre-refactor each
// surface had its own divergent UX: /tasks had a tone selector +
// "Generer IA" button + raw textarea with broken variable
// substitution ("Je suis  de ."), /pipeline had clean template chips
// + Copy + Send via WhatsApp. Two surfaces, two scripts to maintain,
// inconsistent agent experience.
//
// This component renders the chips + editable textarea + Copy +
// Send via WhatsApp + optional "Send via CRM" CTA. Templates and
// variable substitution come from src/lib/messageTemplates.ts so
// every surface speaks the same template syntax ({nom}, {agent},
// {agence}, {projet}, {phone}).

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Send, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  MESSAGE_TEMPLATES, applyMessageVars, type MessageVars,
} from '@/lib/messageTemplates'
import toast from 'react-hot-toast'

interface Props {
  vars: MessageVars
  /** Default selected template id. */
  defaultTemplateId?: string
  /** Notified whenever the agent edits the message — parent persists it. */
  onMessageChange?: (msg: string) => void
  /** Optional CTA: send through the tenant's WhatsApp Cloud API. */
  onSendViaCrm?: (message: string) => void | Promise<void>
  isSendingViaCrm?: boolean
  /** Show the "Envoyer via WhatsApp" deeplink button. Default: true. */
  showWhatsAppDeeplink?: boolean
  /** Show the "Copier" button. Default: true. */
  showCopy?: boolean
  /** Optional slot rendered above the textarea (e.g. tone selector + AI button). */
  toolbarRight?: React.ReactNode
}

export function MessageComposer({
  vars,
  defaultTemplateId = 'relance',
  onMessageChange,
  onSendViaCrm,
  isSendingViaCrm = false,
  showWhatsAppDeeplink = true,
  showCopy = true,
  toolbarRight,
}: Props) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string>(defaultTemplateId)
  const [message, setMessage] = useState<string>('')
  const [edited, setEdited] = useState(false)
  const [copied, setCopied] = useState(false)

  // Re-render the message whenever the template OR the vars change —
  // critical because the agent + tenant context is fetched async, so
  // on first render `vars.agentName` is empty and we must refresh
  // when it lands. The `edited` flag freezes the message after the
  // agent starts typing, otherwise we'd overwrite their edits.
  useEffect(() => {
    if (edited) return
    const tpl = MESSAGE_TEMPLATES.find(t => t.id === selectedId) ?? MESSAGE_TEMPLATES[0]
    const next = applyMessageVars(tpl.message, vars)
    setMessage(next)
    onMessageChange?.(next)
  }, [selectedId, vars.clientName, vars.agentName, vars.agencyName, vars.projectName, vars.clientPhone, edited])

  function handleEdit(next: string) {
    setMessage(next)
    setEdited(true)
    onMessageChange?.(next)
  }

  function handleSelectTemplate(id: string) {
    setSelectedId(id)
    setEdited(false)  // re-arming the auto-render
  }

  function handleCopy() {
    navigator.clipboard.writeText(message)
    setCopied(true)
    toast.success(t('toast.message_copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  function handleWhatsApp() {
    const phone = (vars.clientPhone ?? '').replace(/[\s\-()]/g, '').replace(/^0/, '213')
    if (!phone) {
      toast.error(t('toast.client_phone_missing'))
      return
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  return (
    <div className="space-y-3">
      {/* Template chips */}
      <div className="flex flex-wrap gap-2">
        {MESSAGE_TEMPLATES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleSelectTemplate(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedId === t.id && !edited
                ? 'bg-immo-accent-green/10 text-immo-accent-green'
                : 'border border-immo-border-default text-immo-text-muted hover:text-immo-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
        {edited && (
          <span className="rounded-full bg-immo-status-orange/10 px-2.5 py-1 text-[10px] font-medium text-immo-status-orange">
            Personnalisé
          </span>
        )}
      </div>

      {/* Optional right-side toolbar (tone selector + AI generate) */}
      {toolbarRight && (
        <div className="flex justify-end">{toolbarRight}</div>
      )}

      {/* Editable preview */}
      <textarea
        value={message}
        onChange={e => handleEdit(e.target.value)}
        rows={6}
        className="w-full resize-y rounded-lg border border-immo-border-default bg-immo-bg-primary p-4 text-sm leading-relaxed text-immo-text-primary focus:border-immo-accent-green focus:outline-none"
      />

      {/* Action row */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {showCopy && (
          <Button variant="ghost" onClick={handleCopy} className="text-immo-text-secondary">
            {copied ? <Check className="me-1.5 h-4 w-4 text-immo-accent-green" /> : <Copy className="me-1.5 h-4 w-4" />}
            {copied ? 'Copié !' : 'Copier'}
          </Button>
        )}
        {onSendViaCrm && (
          <Button
            onClick={() => onSendViaCrm(message)}
            disabled={isSendingViaCrm || !message.trim()}
            className="bg-[#25D366] font-semibold text-white hover:bg-[#128C7E]"
          >
            <Send className="me-1.5 h-4 w-4" />
            {isSendingViaCrm ? 'Envoi…' : 'Envoyer via CRM'}
          </Button>
        )}
        {showWhatsAppDeeplink && (
          <Button onClick={handleWhatsApp} className="bg-[#25D366] font-semibold text-white hover:bg-[#128C7E]">
            <Send className="me-1.5 h-4 w-4" /> Envoyer via WhatsApp
          </Button>
        )}
      </div>
    </div>
  )
}
