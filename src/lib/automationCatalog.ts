// Frontend catalog of the 25 automation touchpoints seeded by migration 043.
// Pure metadata — labels, descriptions, stage grouping — used by
// /settings/automations to render each row with proper context.
//
// The technical truth is the `tenant_automation_settings` table: each row
// stores (automation_key, channel, mode, template_name, offset_minutes).
// This file gives the agent-facing label and the visual grouping by
// pipeline stage. Keep in sync with migration 043 — if a key is added
// or renamed there, mirror it here.

export type AutomationChannel = 'whatsapp' | 'call' | 'email' | 'in_person' | 'internal'
export type AutomationMode = 'auto' | 'manual' | 'disabled'

export type AutomationStage =
  | 'accueil'
  | 'visite_a_gerer'
  | 'visite_confirmee'
  | 'visite_terminee'
  | 'negociation'
  | 'reservation'
  | 'vente'

export interface AutomationDef {
  key: string                 // matches tenant_automation_settings.automation_key
  stage: AutomationStage
  channel: AutomationChannel
  label: string               // short, French, agent-facing
  description: string         // when does this fire, what does the client receive
  defaultMode: AutomationMode
  offsetLabel: string         // human-readable trigger time, e.g. "J-1", "H-2", "Immédiat"
}

export const STAGE_LABELS: Record<AutomationStage, { label: string; emoji: string; color: string }> = {
  accueil:           { label: 'Accueil',           emoji: '🟦', color: '#7F96B7' },
  visite_a_gerer:    { label: 'Visite à gérer',    emoji: '🟧', color: '#FF9A1E' },
  visite_confirmee:  { label: 'Visite confirmée',  emoji: '🟦', color: '#3782FF' },
  visite_terminee:   { label: 'Visite terminée',   emoji: '🟪', color: '#A855F7' },
  negociation:       { label: 'Négociation',       emoji: '🟨', color: '#EAB308' },
  reservation:       { label: 'Réservation',       emoji: '🟦', color: '#06B6D4' },
  vente:             { label: 'Vente',             emoji: '🟢', color: '#00D4A0' },
}

export const CHANNEL_LABELS: Record<AutomationChannel, string> = {
  whatsapp:  'WhatsApp',
  call:      'Appel',
  email:     'Email',
  in_person: 'Rendez-vous',
  internal:  'Interne',
}

export const MODE_LABELS: Record<AutomationMode, { label: string; description: string; color: string }> = {
  auto: {
    label: 'Automatique',
    description: 'Le système exécute sans intervention',
    color: 'green',
  },
  manual: {
    label: 'Validation manuelle',
    description: 'Une tâche est créée, l’agent valide avant envoi',
    color: 'orange',
  },
  disabled: {
    label: 'Désactivé',
    description: 'Cette automation ne se déclenche pas',
    color: 'red',
  },
}

export const AUTOMATIONS: AutomationDef[] = [
  // ────────── ACCUEIL ──────────
  {
    key: 'accueil_bienvenue',
    stage: 'accueil',
    channel: 'whatsapp',
    label: 'Bienvenue lead',
    description: 'Message envoyé à la création du lead pour confirmer la prise en compte.',
    defaultMode: 'manual',
    offsetLabel: 'Immédiat',
  },
  {
    key: 'accueil_call_qualification',
    stage: 'accueil',
    channel: 'call',
    label: 'Appel de qualification',
    description: 'Tâche d’appel pour comprendre les besoins du prospect.',
    defaultMode: 'manual',
    offsetLabel: 'J+1',
  },
  {
    key: 'accueil_relance_j7',
    stage: 'accueil',
    channel: 'whatsapp',
    label: 'Relance J+7',
    description: 'Message de relance si aucune progression depuis 7 jours.',
    defaultMode: 'manual',
    offsetLabel: 'J+7',
  },
  // ────────── VISITE À GÉRER ──────────
  {
    key: 'visite_a_gerer_call',
    stage: 'visite_a_gerer',
    channel: 'call',
    label: 'Caler la visite par téléphone',
    description: 'Tâche d’appel pour fixer la date avec le client.',
    defaultMode: 'manual',
    offsetLabel: 'Immédiat',
  },
  {
    key: 'visite_a_gerer_relance',
    stage: 'visite_a_gerer',
    channel: 'whatsapp',
    label: 'Relance créneaux disponibles',
    description: 'Message proposant à nouveau des créneaux après J+3 sans visite planifiée.',
    defaultMode: 'manual',
    offsetLabel: 'J+3',
  },
  // ────────── VISITE CONFIRMÉE ──────────
  {
    key: 'visite_confirmation_j_moins_1',
    stage: 'visite_confirmee',
    channel: 'whatsapp',
    label: 'Confirmation visite J-1',
    description: 'Confirmation envoyée la veille de la visite avec adresse + conseiller.',
    defaultMode: 'auto',
    offsetLabel: 'J-1',
  },
  {
    key: 'visite_rappel_h_moins_2',
    stage: 'visite_confirmee',
    channel: 'whatsapp',
    label: 'Rappel visite H-2',
    description: 'Rappel pratique 2h avant la visite.',
    defaultMode: 'auto',
    offsetLabel: 'H-2',
  },
  {
    key: 'visite_annulation_call',
    stage: 'visite_confirmee',
    channel: 'call',
    label: 'Replanifier après annulation',
    description: 'Tâche d’appel pour reprogrammer une visite annulée.',
    defaultMode: 'manual',
    offsetLabel: 'Immédiat',
  },
  // ────────── VISITE TERMINÉE ──────────
  {
    key: 'visite_terminee_remerciement',
    stage: 'visite_terminee',
    channel: 'whatsapp',
    label: 'Remerciement post-visite',
    description: 'Message de remerciement le soir même de la visite.',
    defaultMode: 'manual',
    offsetLabel: 'J+0',
  },
  {
    key: 'visite_terminee_call_feedback',
    stage: 'visite_terminee',
    channel: 'call',
    label: 'Appel feedback à chaud',
    description: 'Tâche d’appel pour récolter le ressenti à J+1 — le levier de conversion #1 post-visite.',
    defaultMode: 'manual',
    offsetLabel: 'J+1',
  },
  {
    key: 'visite_terminee_relance_j3',
    stage: 'visite_terminee',
    channel: 'whatsapp',
    label: '"Souhaitez-vous une 2e visite ?"',
    description: 'Relance pour proposer une 2e visite à J+3.',
    defaultMode: 'manual',
    offsetLabel: 'J+3',
  },
  {
    key: 'visite_terminee_call_decision',
    stage: 'visite_terminee',
    channel: 'call',
    label: 'Appel décision',
    description: 'Tâche d’appel à J+7 pour pousser la décision.',
    defaultMode: 'manual',
    offsetLabel: 'J+7',
  },
  // ────────── NÉGOCIATION ──────────
  {
    key: 'negociation_call_recap',
    stage: 'negociation',
    channel: 'call',
    label: 'Récap offre par téléphone',
    description: 'Tâche d’appel pour ouvrir la négociation et récapituler l’offre.',
    defaultMode: 'manual',
    offsetLabel: 'Immédiat',
  },
  {
    key: 'negociation_call_suivi',
    stage: 'negociation',
    channel: 'call',
    label: 'Suivi de négociation',
    description: 'Tâche d’appel à J+3 pour suivre les points bloquants.',
    defaultMode: 'manual',
    offsetLabel: 'J+3',
  },
  {
    key: 'negociation_expiration',
    stage: 'negociation',
    channel: 'whatsapp',
    label: 'Offre expire bientôt',
    description: 'Message à J+7 pour rappeler que l’offre expire sous peu.',
    defaultMode: 'manual',
    offsetLabel: 'J+7',
  },
  {
    key: 'negociation_call_decision',
    stage: 'negociation',
    channel: 'call',
    label: 'Appel décision finale',
    description: 'Tâche d’appel à J+14 — last call avant relance ou perdue.',
    defaultMode: 'manual',
    offsetLabel: 'J+14',
  },
  // ────────── RÉSERVATION ──────────
  {
    key: 'reservation_confirmation',
    stage: 'reservation',
    channel: 'whatsapp',
    label: 'Confirmation de réservation',
    description: 'Confirmation envoyée à la création de la réservation.',
    defaultMode: 'auto',
    offsetLabel: 'Immédiat',
  },
  {
    key: 'reservation_versement_j3',
    stage: 'reservation',
    channel: 'whatsapp',
    label: 'Rappel versement initial',
    description: 'Rappel J-3 avant l’échéance du versement initial.',
    defaultMode: 'auto',
    offsetLabel: 'J-3',
  },
  {
    key: 'reservation_paiement_recu',
    stage: 'reservation',
    channel: 'whatsapp',
    label: 'Confirmation versement reçu',
    description: 'Confirmation automatique à la réception du versement initial.',
    defaultMode: 'auto',
    offsetLabel: 'Immédiat',
  },
  {
    key: 'reservation_call_expiration',
    stage: 'reservation',
    channel: 'call',
    label: 'Appel urgence avant expiration',
    description: 'Tâche d’appel à J-7 avant expiration pour finaliser.',
    defaultMode: 'manual',
    offsetLabel: 'J-7',
  },
  // ────────── VENTE ──────────
  {
    key: 'vente_signature_felicitations',
    stage: 'vente',
    channel: 'whatsapp',
    label: 'Félicitations signature',
    description: 'Message de félicitations envoyé à la signature.',
    defaultMode: 'auto',
    offsetLabel: 'Immédiat',
  },
  {
    key: 'vente_paiement_echeance_j3',
    stage: 'vente',
    channel: 'whatsapp',
    label: 'Rappel échéance paiement J-3',
    description: 'Rappel automatique 3 jours avant chaque échéance.',
    defaultMode: 'auto',
    offsetLabel: 'J-3',
  },
  {
    key: 'vente_paiement_recu',
    stage: 'vente',
    channel: 'whatsapp',
    label: 'Confirmation paiement reçu',
    description: 'Confirmation automatique à chaque paiement reçu.',
    defaultMode: 'auto',
    offsetLabel: 'Immédiat',
  },
  {
    key: 'vente_paiement_retard',
    stage: 'vente',
    channel: 'whatsapp',
    label: 'Notification impayé',
    description: 'Notification soft envoyée à J+1 après échéance non réglée.',
    defaultMode: 'auto',
    offsetLabel: 'J+1',
  },
  {
    key: 'vente_call_impaye_j7',
    stage: 'vente',
    channel: 'call',
    label: 'Appel impayé urgent',
    description: 'Tâche d’appel direct à J+7 — escalade humaine sur l’impayé.',
    defaultMode: 'manual',
    offsetLabel: 'J+7',
  },
]

export const AUTOMATIONS_BY_STAGE = AUTOMATIONS.reduce<Record<AutomationStage, AutomationDef[]>>(
  (acc, a) => {
    if (!acc[a.stage]) acc[a.stage] = []
    acc[a.stage].push(a)
    return acc
  },
  {} as Record<AutomationStage, AutomationDef[]>,
)

export const STAGE_ORDER: AutomationStage[] = [
  'accueil',
  'visite_a_gerer',
  'visite_confirmee',
  'visite_terminee',
  'negociation',
  'reservation',
  'vente',
]
