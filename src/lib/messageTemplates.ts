// Single source of truth for the 5 stage-agnostic templates an agent
// can quickly send via WhatsApp / SMS. Lives at the lib level because
// both MessageTemplateModal (called from QuickActions on the client
// detail page) and TaskDetailModal (called from /tasks) need the
// same set — they used to inline-define divergent template sets.
//
// `applyMessageVars` does the variable substitution. Every consumer
// must use it so {nom}, {agent}, {projet}, {agence}, {phone} are
// rendered consistently and missing values fall back to safe defaults
// rather than leaving the placeholder visible to the agent.

export interface MessageTemplate {
  id: string
  label: string
  /** Raw template body — variables wrapped in {curlies}. */
  message: string
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'relance',
    label: 'Relance client',
    message: "Bonjour {nom}, j'espère que vous allez bien. Suite à notre dernier échange, je me permets de revenir vers vous concernant votre projet immobilier. Avez-vous des questions ? Cordialement, {agent}",
  },
  {
    id: 'visite_confirm',
    label: 'Confirmation visite',
    message: "Bonjour {nom}, je vous confirme votre visite prévue. Merci de vous présenter à l'heure au bureau. À bientôt, {agent}",
  },
  {
    id: 'rappel_paiement',
    label: 'Rappel paiement',
    message: 'Bonjour {nom}, nous vous rappelons que votre échéance de paiement est proche. Merci de vous rapprocher de notre service commercial. Cordialement, {agent}',
  },
  {
    id: 'felicitations',
    label: 'Félicitations vente',
    message: 'Félicitations {nom} ! Votre acquisition au sein du projet {projet} est finalisée. Nous vous souhaitons beaucoup de bonheur dans votre nouveau bien. {agent}',
  },
  {
    id: 'bienvenue',
    label: 'Bienvenue',
    message: "Bonjour {nom}, bienvenue et merci de l'intérêt que vous portez à nos programmes immobiliers. Je suis {agent} de {agence}, votre conseiller dédié. N'hésitez pas à me contacter pour toute question.",
  },
]

export interface MessageVars {
  clientName: string
  clientPhone?: string | null
  agentName?: string | null
  agencyName?: string | null
  projectName?: string | null
}

/**
 * Replace {nom}, {agent}, {agence}, {projet}, {phone} in a template.
 * Missing values fall back to neutral placeholders so we never render
 * "Je suis  de ." when context hasn't loaded yet.
 */
export function applyMessageVars(template: string, vars: MessageVars): string {
  return template
    .replace(/\{nom\}/g, vars.clientName || 'Madame, Monsieur')
    .replace(/\{agent\}/g, vars.agentName || 'votre conseiller')
    .replace(/\{agence\}/g, vars.agencyName || 'notre agence')
    .replace(/\{projet\}/g, vars.projectName || 'notre projet')
    .replace(/\{phone\}/g, vars.clientPhone || '')
}
