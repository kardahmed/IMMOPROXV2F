// Frontend mirror of the 10 Meta-approved Utility templates defined in
// WHATSAPP_TEMPLATES_CATALOG.md at the repo root. Used to:
//
//   1. Render a human-readable preview of an automation task's
//      message in the /tasks UI ("voici ce qui sera envoye").
//   2. Build a wa.me deeplink with the pre-rendered body so an agent
//      on the Essentiel plan (no WhatsApp Business API) can tap once
//      to open WhatsApp with the message ready to send.
//
// IMPORTANT: this map must stay in lock-step with WHATSAPP_TEMPLATES_CATALOG.md
// and the templates actually approved on Meta's side. If Meta re-categorizes
// or forces edits, update here too — otherwise the preview will diverge from
// what actually gets sent through `send-whatsapp`.

export type TemplateName =
  | 'visite_confirmation_j_moins_1'
  | 'visite_rappel_h_moins_2'
  | 'visite_annulation'
  | 'document_demande'
  | 'document_recu'
  | 'document_rappel_manquant'
  | 'paiement_echeance_j_moins_3'
  | 'paiement_recu'
  | 'paiement_retard'
  | 'reservation_confirmation'
  | 'nouveau_lead__immo_prox'

type TemplateDef = {
  /** Short human label for the 🤖 badge (French, agent-facing). */
  label: string
  /** Template body as approved on Meta, with {{X}} placeholders. */
  body: string
  /** Number of variables the template expects (sanity check). */
  paramCount: number
}

export const TEMPLATES: Record<TemplateName, TemplateDef> = {
  visite_confirmation_j_moins_1: {
    label: 'Confirmation visite J-1',
    paramCount: 5,
    body: `Bonjour {{1}},

Nous vous confirmons votre visite prevue le {{2}} a {{3}}.

Adresse : {{4}}
Conseiller : {{5}}

En cas d'empechement, contactez votre conseiller.`,
  },

  visite_rappel_h_moins_2: {
    label: 'Rappel visite 2h',
    paramCount: 4,
    body: `Bonjour {{1}},

Votre visite est prevue dans 2 heures, a {{2}}.

Adresse : {{3}}
Conseiller : {{4}}`,
  },

  visite_annulation: {
    label: 'Annulation visite',
    paramCount: 5,
    body: `Bonjour {{1}},

Votre visite du {{2}} a {{3}} a ete annulee.

Motif : {{4}}
Votre conseiller {{5}} vous recontactera pour reporter.`,
  },

  document_demande: {
    label: 'Demande documents',
    paramCount: 3,
    body: `Bonjour {{1}},

Pour completer votre dossier, merci de transmettre les documents suivants :

{{2}}

Contact : {{3}}`,
  },

  document_recu: {
    label: 'Documents recus',
    paramCount: 4,
    body: `Bonjour {{1}},

Nous avons bien recu vos documents : {{2}}

Date de reception : {{3}}
Votre dossier est en cours de traitement.

Conseiller : {{4}}`,
  },

  document_rappel_manquant: {
    label: 'Rappel documents',
    paramCount: 4,
    body: `Bonjour {{1}},

Les documents suivants sont toujours en attente pour votre dossier :

{{2}}

Date limite : {{3}}
Conseiller : {{4}}`,
  },

  paiement_echeance_j_moins_3: {
    label: 'Rappel echeance J-3',
    paramCount: 5,
    body: `Bonjour {{1}},

Une echeance de {{2}} DZD est prevue le {{3}}.

Reference dossier : {{4}}
RIB pour virement : {{5}}

Contactez votre conseiller pour toute question.`,
  },

  paiement_recu: {
    label: 'Paiement recu',
    paramCount: 6,
    body: `Bonjour {{1}},

Nous accusons reception de votre paiement de {{2}} DZD le {{3}}.

Reference : {{4}}
Solde restant : {{5}} DZD

Conseiller : {{6}}`,
  },

  paiement_retard: {
    label: 'Impaye',
    paramCount: 5,
    body: `Bonjour {{1}},

L'echeance du {{2}} ({{3}} DZD) n'a pas ete reglee a ce jour.

Reference dossier : {{4}}
Contactez votre conseiller : {{5}}`,
  },

  reservation_confirmation: {
    label: 'Confirmation reservation',
    paramCount: 6,
    body: `Bonjour {{1}},

Votre reservation a ete enregistree.

Bien : {{2}} (Lot {{3}})
Projet : {{4}}
Date : {{5}}
Conseiller : {{6}}`,
  },

  // Founder notification template — listed so the badge label shows
  // sensibly in the /admin/security-audit UI when this template gets
  // dispatched.
  nouveau_lead__immo_prox: {
    label: 'Nouveau lead',
    paramCount: 5,
    body: `Nouveau lead capture depuis le site web.

Nom : {{1}}
Email : {{2}}
Telephone : {{3}}
Entreprise : {{4}}
Message : {{5}}

Notification automatique.`,
  },
}

/**
 * Substitute {{1}}, {{2}}, ... in a template body with the provided
 * ordered params. Missing params fall back to an empty string so the
 * render doesn't blow up on incomplete data — the UI still renders
 * something the agent can eyeball.
 */
export function renderTemplate(name: TemplateName, params: string[]): string {
  const def = TEMPLATES[name]
  if (!def) return ''
  return def.body.replace(/\{\{(\d+)\}\}/g, (_, idx) => params[Number(idx) - 1] ?? '')
}

/**
 * Build a wa.me deeplink that opens WhatsApp on the user's device
 * with the given text pre-filled. The phone is stripped of spaces,
 * dashes, parens, and +. Country prefix 213 is assumed for Algerian
 * numbers starting with 0.
 */
export function buildWhatsAppDeeplink(phone: string, text: string): string {
  let cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '')
  if (cleanPhone.startsWith('0')) cleanPhone = '213' + cleanPhone.slice(1)
  const encoded = encodeURIComponent(text)
  return `https://wa.me/${cleanPhone}?text=${encoded}`
}

/**
 * Return the friendly label for a template name, or a sensible
 * fallback (humanized snake_case) if the name isn't in the map —
 * useful when a cron dispatches a template we haven't registered
 * on the frontend yet.
 */
export function getTemplateLabel(name: string): string {
  const def = (TEMPLATES as Record<string, TemplateDef>)[name]
  if (def) return def.label
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
