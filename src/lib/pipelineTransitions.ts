// State machine for the 9-stage pipeline.
//
// Pre-fix the SmartStageDialog accepted ANY stage → ANY stage move.
// An agent could drag a fresh "accueil" lead straight to "vente" and
// the system happily booked it as a sale, breaking funnel KPIs,
// downstream automations (touchpoint cron, no-reply chase) and the
// stage-change history that managers rely on for coaching.
//
// This file declares which transitions make business sense. The
// rules mirror the catalogue documented in ROADMAP / phase 7:
//   accueil → visite_a_gerer → visite_confirmee → visite_terminee
//          → negociation → reservation → vente
// with relancement / perdue reachable from anywhere (a deal can die
// at any time), and a one-way `relancement → accueil` re-entry path.
//
// Permission gating, history insert and confirm-dialog logic live at
// the call site (PipelinePage / SmartStageDialog). This module just
// answers "is the move legal?".

import type { PipelineStage } from '@/types'

// Outgoing edges. Each key lists the stages a client can move TO
// from the key stage. Stages NOT in the list are forbidden moves.
const ALLOWED: Record<PipelineStage, ReadonlyArray<PipelineStage>> = {
  // Fresh lead. Can be qualified into a visit, or killed early.
  accueil: ['visite_a_gerer', 'relancement', 'perdue'],

  // Visit booked but not confirmed yet.
  visite_a_gerer: ['visite_confirmee', 'accueil', 'relancement', 'perdue'],

  // Visit confirmed, waiting to happen.
  visite_confirmee: ['visite_terminee', 'visite_a_gerer', 'relancement', 'perdue'],

  // Visit happened. Either we negotiate, or we lose it.
  visite_terminee: ['negociation', 'relancement', 'perdue'],

  // Active commercial discussion.
  negociation: ['reservation', 'visite_terminee', 'relancement', 'perdue'],

  // Client locked the unit with a deposit. Next step is contract.
  reservation: ['vente', 'negociation', 'relancement', 'perdue'],

  // Sale closed. The terminal happy path. Re-opening only via support.
  vente: ['perdue'],

  // Cooling off — agent waiting to relaunch later. Can re-enter the
  // funnel from the top OR die definitively.
  relancement: ['accueil', 'perdue'],

  // Definitive loss. Re-entering means a NEW lead conceptually, but
  // we allow `accueil` for the rare "client called us back" case.
  perdue: ['accueil'],
}

/**
 * Returns true when moving a client from `from` to `to` matches a
 * documented funnel transition. Self-moves (from === to) return
 * false — caller should early-return before invoking the dialog.
 */
export function isValidTransition(from: PipelineStage, to: PipelineStage): boolean {
  if (from === to) return false
  return ALLOWED[from]?.includes(to) ?? false
}

/**
 * Stages a client can legally move to from the given stage.
 * Useful for rendering a constrained dropdown ("where to next?")
 * instead of the full 9-stage list.
 */
export function allowedNextStages(from: PipelineStage): ReadonlyArray<PipelineStage> {
  return ALLOWED[from] ?? []
}

/**
 * Human-readable explanation for a refused transition. Surfaces in
 * the toast when an agent tries an illegal drag-and-drop.
 */
export function explainRefusedTransition(from: PipelineStage, to: PipelineStage): string {
  if (from === to) return 'Le client est déjà à cette étape'
  const allowed = ALLOWED[from] ?? []
  if (allowed.length === 0) {
    return `Aucune transition autorisée depuis ${from}`
  }
  return `Transition ${from} → ${to} non autorisée. Étapes possibles : ${allowed.join(', ')}`
}
