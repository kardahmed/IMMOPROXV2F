// Hourly cron — fires stage-based time touchpoints from the Phase 7
// catalogue. The other crons (check-reminders, check-payments,
// check-reservations) handle event-anchored touchpoints (J-1 visite,
// J-3 paiement…); this one handles time-in-stage touchpoints, e.g.
//
//   accueil_call_qualification     → J+1 in `accueil`
//   accueil_relance_j7              → J+7 in `accueil`
//   visite_a_gerer_relance          → J+3 in `visite_a_gerer`
//   visite_terminee_call_feedback   → J+1 in `visite_terminee`
//   visite_terminee_relance_j3      → J+3 in `visite_terminee`
//   visite_terminee_call_decision   → J+7 in `visite_terminee`
//   negociation_call_recap          → J+0 in `negociation`
//   negociation_call_suivi          → J+3 in `negociation`
//   negociation_expiration          → J+7 in `negociation`
//   negociation_call_decision       → J+14 in `negociation`
//
// Each tick:
//   1. SELECT clients per stage where pipeline_stage_changed_at is
//      old enough that the touchpoint should have fired.
//   2. dispatchAutomation handles the rest — checks the per-tenant
//      mode (auto / manual / disabled), idempotency
//      (related_id = client.id + automation_key), plan gate, and
//      routing (Meta API or task fallback).
//
// Idempotency: dispatchAutomation's existing check ensures each
// (client, automation_key) only fires once. The cron can run every
// hour without spamming.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { dispatchAutomation } from '../_shared/dispatchAutomation.ts'
import { isAuthorizedCron, unauthorizedResponse } from '../_shared/cronAuth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface StageTouchpoint {
  /** automation_key — must match a row seeded by migration 043. */
  key: string
  /** Pipeline stage the client must be in. */
  stage: string
  /** Hours after stage entry when the touchpoint should fire. */
  hoursAfterStage: number
  /** Hour-window upper bound — don't fire if client has been in stage
   *  way longer (avoids spamming clients sitting in a stage forever). */
  hoursMaxWindow: number
  /** Title used for the fallback task / dispatchAutomation. */
  title: (clientName: string) => string
  /** related_type for dispatchAutomation idempotency keying. */
  relatedType: 'client'
}

const TOUCHPOINTS: StageTouchpoint[] = [
  // ── Accueil ─────────────────────────────────────────────────────
  {
    key: 'accueil_call_qualification',
    stage: 'accueil',
    hoursAfterStage: 24,            // J+1
    hoursMaxWindow: 24 * 6,
    title: (n) => `Appeler ${n} pour qualifier le besoin`,
    relatedType: 'client',
  },
  {
    key: 'accueil_relance_j7',
    stage: 'accueil',
    hoursAfterStage: 24 * 7,        // J+7
    hoursMaxWindow: 24 * 14,
    title: (n) => `Relance ${n} (accueil J+7)`,
    relatedType: 'client',
  },

  // ── Visite à gérer ──────────────────────────────────────────────
  {
    key: 'visite_a_gerer_relance',
    stage: 'visite_a_gerer',
    hoursAfterStage: 24 * 3,        // J+3
    hoursMaxWindow: 24 * 7,
    title: (n) => `Relance créneaux visite — ${n}`,
    relatedType: 'client',
  },

  // ── Visite terminée ─────────────────────────────────────────────
  {
    key: 'visite_terminee_remerciement',
    stage: 'visite_terminee',
    hoursAfterStage: 0,             // J+0 (on stage entry)
    hoursMaxWindow: 12,             // very tight window — only the first hours
    title: (n) => `Remerciement post-visite — ${n}`,
    relatedType: 'client',
  },
  {
    key: 'visite_terminee_call_feedback',
    stage: 'visite_terminee',
    hoursAfterStage: 24,            // J+1
    hoursMaxWindow: 24 * 4,
    title: (n) => `Appeler ${n} pour feedback post-visite`,
    relatedType: 'client',
  },
  {
    key: 'visite_terminee_relance_j3',
    stage: 'visite_terminee',
    hoursAfterStage: 24 * 3,        // J+3
    hoursMaxWindow: 24 * 7,
    title: (n) => `Souhaitez-vous une 2e visite ? — ${n}`,
    relatedType: 'client',
  },
  {
    key: 'visite_terminee_call_decision',
    stage: 'visite_terminee',
    hoursAfterStage: 24 * 7,        // J+7
    hoursMaxWindow: 24 * 14,
    title: (n) => `Appel décision post-visite — ${n}`,
    relatedType: 'client',
  },

  // ── Négociation ─────────────────────────────────────────────────
  {
    key: 'negociation_call_recap',
    stage: 'negociation',
    hoursAfterStage: 0,             // J+0 immediate
    hoursMaxWindow: 12,
    title: (n) => `Récap offre par téléphone — ${n}`,
    relatedType: 'client',
  },
  {
    key: 'negociation_call_suivi',
    stage: 'negociation',
    hoursAfterStage: 24 * 3,        // J+3
    hoursMaxWindow: 24 * 6,
    title: (n) => `Suivi de négociation — ${n}`,
    relatedType: 'client',
  },
  {
    key: 'negociation_expiration',
    stage: 'negociation',
    hoursAfterStage: 24 * 7,        // J+7
    hoursMaxWindow: 24 * 14,
    title: (n) => `L'offre expire bientôt — ${n}`,
    relatedType: 'client',
  },
  {
    key: 'negociation_call_decision',
    stage: 'negociation',
    hoursAfterStage: 24 * 14,       // J+14
    hoursMaxWindow: 24 * 21,
    title: (n) => `Appel décision finale — ${n}`,
    relatedType: 'client',
  },
]

interface ClientRow {
  id: string
  tenant_id: string
  agent_id: string | null
  full_name: string
  phone: string | null
  pipeline_stage_changed_at: string
}

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return unauthorizedResponse()

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const summary = {
    touchpoints_scanned: 0,
    clients_matched: 0,
    dispatched: 0,
    skipped: 0,
    errors: [] as string[],
  }

  for (const tp of TOUCHPOINTS) {
    summary.touchpoints_scanned++

    const lower = new Date(Date.now() - tp.hoursMaxWindow * 3600 * 1000).toISOString()
    const upper = new Date(Date.now() - tp.hoursAfterStage * 3600 * 1000).toISOString()

    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, tenant_id, agent_id, full_name, phone, pipeline_stage_changed_at')
      .eq('pipeline_stage', tp.stage)
      .gte('pipeline_stage_changed_at', lower)
      .lte('pipeline_stage_changed_at', upper)
      .is('deleted_at', null)

    if (error) {
      summary.errors.push(`${tp.key}: ${error.message}`)
      continue
    }

    for (const c of (clients ?? []) as ClientRow[]) {
      summary.clients_matched++
      try {
        const result = await dispatchAutomation({
          supabase,
          tenantId: c.tenant_id,
          clientId: c.id,
          agentId: c.agent_id,
          templateName: tp.key,
          // No template params yet for stage-based touchpoints — the
          // operator can add them per template via the catalog later.
          templateParams: [c.full_name],
          clientPhone: c.phone,
          fallbackTaskTitle: tp.title(c.full_name),
          fallbackDueAt: new Date(),
          relatedId: c.id,
          relatedType: tp.relatedType,
          triggerSource: 'cron_check_stage_touchpoints',
        })
        if (result.path === 'skipped') summary.skipped++
        else summary.dispatched++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        summary.errors.push(`${tp.key}/${c.id}: ${msg}`)
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
