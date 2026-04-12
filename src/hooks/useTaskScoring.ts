/**
 * Calculate urgency score for a task (0-100).
 * Higher = more urgent = should be done first.
 */
export function calculateUrgencyScore(task: {
  priority: string
  status: string
  scheduled_at: string | null
  created_at: string
}): number {
  let score = 0
  const now = Date.now()

  // Priority weight (40 pts max)
  const priorityMap: Record<string, number> = { urgent: 40, high: 30, medium: 15, low: 5 }
  score += priorityMap[task.priority] ?? 15

  // Overdue penalty (40 pts max)
  if (task.scheduled_at && task.status !== 'completed') {
    const scheduledAt = new Date(task.scheduled_at).getTime()
    if (scheduledAt < now) {
      const hoursOverdue = (now - scheduledAt) / 3600000
      score += Math.min(40, Math.round(hoursOverdue * 2)) // 2 pts per hour overdue, max 40
    }
  }

  // Age penalty (20 pts max) — older tasks are more urgent
  const ageHours = (now - new Date(task.created_at).getTime()) / 3600000
  score += Math.min(20, Math.round(ageHours / 12)) // 1 pt per 12 hours

  return Math.min(100, score)
}

/**
 * Detect at-risk clients: in negotiation/reservation with no contact > 7 days
 */
export function isClientAtRisk(client: {
  pipeline_stage: string
  last_contact_at: string | null
}): { atRisk: boolean; reason: string; daysSinceContact: number } {
  const riskStages = ['negociation', 'reservation', 'visite_terminee']
  if (!riskStages.includes(client.pipeline_stage)) return { atRisk: false, reason: '', daysSinceContact: 0 }

  const lastContact = client.last_contact_at ? new Date(client.last_contact_at).getTime() : 0
  const daysSince = lastContact ? Math.floor((Date.now() - lastContact) / 86400000) : 999

  const thresholds: Record<string, number> = { negociation: 3, reservation: 5, visite_terminee: 5 }
  const threshold = thresholds[client.pipeline_stage] ?? 7

  if (daysSince >= threshold) {
    return {
      atRisk: true,
      reason: `Aucun contact depuis ${daysSince}j en ${client.pipeline_stage}`,
      daysSinceContact: daysSince,
    }
  }

  return { atRisk: false, reason: '', daysSinceContact: daysSince }
}

/**
 * Suggest next action based on client state
 */
export function suggestNextAction(client: {
  pipeline_stage: string
  last_contact_at: string | null
  confirmed_budget: number | null
  visit_note: number | null
}): string {
  const stage = client.pipeline_stage
  const daysSinceContact = client.last_contact_at
    ? Math.floor((Date.now() - new Date(client.last_contact_at).getTime()) / 86400000)
    : 999

  if (daysSinceContact > 5) return 'Relance urgente — aucun contact depuis ' + daysSinceContact + ' jours'
  if (stage === 'accueil' && !client.confirmed_budget) return 'Appel de qualification pour identifier le budget'
  if (stage === 'accueil') return 'Proposer un creneau de visite'
  if (stage === 'visite_a_gerer') return 'Confirmer la visite et envoyer la localisation'
  if (stage === 'visite_confirmee') return 'Rappel J-1 pour la visite'
  if (stage === 'visite_terminee' && (client.visit_note ?? 0) >= 4) return 'Client satisfait — lancer la negociation'
  if (stage === 'visite_terminee') return 'Proposer une 2eme visite avec le conjoint'
  if (stage === 'negociation') return 'Envoyer la simulation de prix detaillee'
  if (stage === 'reservation') return 'Collecter les documents (CIN + depot)'
  if (stage === 'vente') return 'Planifier le RDV notaire'
  if (stage === 'relancement') return 'Envoyer les nouvelles unites disponibles'

  return 'Contacter le client'
}
