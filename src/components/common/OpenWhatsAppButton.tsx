import { MessageCircle } from 'lucide-react'
import {
  renderTemplate,
  buildWhatsAppDeeplink,
  type TemplateName,
} from '@/lib/whatsappTemplates'

type Props = {
  /** Template name (must match one in TEMPLATES map). */
  templateName: string | null | undefined
  /** Ordered template params. Same order as the approved Meta template. */
  templateParams: unknown
  /** Phone to dial. Cleaned inside buildWhatsAppDeeplink. */
  clientPhone: string | null | undefined
  /** Optional className for sizing in the caller. */
  className?: string
  /** Override the default label (defaults to "Envoyer WhatsApp"). */
  label?: string
}

/**
 * Opens WhatsApp on the user's device with the template body
 * pre-rendered and pre-filled in the compose box. One tap and the
 * agent is ready to send — this is the Essentiel-plan fallback for
 * automation tasks, so the agent doesn't have to re-type the message.
 *
 * Renders nothing when:
 *   - no templateName → we can't render the body
 *   - no clientPhone → we can't build the deeplink
 *
 * That way the caller can render unconditionally and we handle the
 * "not enough data" case cleanly.
 */
export function OpenWhatsAppButton({
  templateName,
  templateParams,
  clientPhone,
  className,
  label = 'Envoyer WhatsApp',
}: Props) {
  if (!templateName || !clientPhone) return null

  // Guard against arbitrary JSON shapes coming out of Supabase JSONB.
  // Only proceed if templateParams is an array of strings; otherwise
  // render the template with empty params (falls back to the raw
  // {{X}} placeholders which at least tells the agent what's missing).
  const paramsArray: string[] = Array.isArray(templateParams)
    ? (templateParams as unknown[]).map(v => String(v ?? ''))
    : []

  const rendered = renderTemplate(templateName as TemplateName, paramsArray)
  const href = buildWhatsAppDeeplink(clientPhone, rendered)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-md bg-[#25D366] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#1da851] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/40 ${className ?? ''}`}
      title="Ouvre WhatsApp avec le message pre-rempli"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      {label}
    </a>
  )
}
