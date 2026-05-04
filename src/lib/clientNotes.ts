// Single helper for prepending a timestamped entry to clients.notes.
//
// The Notes tab on the client detail page renders the free-form
// `clients.notes` TEXT column. Many UI surfaces capture notes
// (CallModeOverlay outcomes, visit feedback in SmartStageDialog,
// message bodies in WhatsAppButton, task responses in
// TaskDetailModal, etc.) — they all funnel through this helper so
// the trace lands back in the Notes tab with consistent formatting.
//
// IMPORTANT: pre-068 this helper did a read-modify-write
// (`select notes` → format → `update notes`). Two concurrent calls
// (e.g. an agent moving the stage at the same instant a WhatsApp
// send fires) clobbered each other and lost notes. Migration 068
// introduced the `append_client_note` RPC which performs the merge
// inside a single UPDATE; Postgres' row-level write lock makes it
// atomic. We now build the formatted block client-side and hand it
// to the RPC.
//
// New entries land at the top, so scrolling down walks
// chronologically backwards. The agent can still edit the notes
// freely afterwards — this only PREPENDS, never overwrites.

import { supabase } from './supabase'

/**
 * Prepend a timestamped block to clients.notes atomically.
 *
 * @param clientId  The client whose notes should be updated. Pass null
 *                  / undefined and the call becomes a no-op (some
 *                  surfaces can't always tie an action to a client —
 *                  e.g. a draft visit not yet linked to a client_id).
 * @param header    One-line header — kind + context, e.g.
 *                  "✓ Appel réussi (Relance suite visite)" or
 *                  "💬 WhatsApp envoyé (rappel échéance J-3)".
 * @param body      Free-form notes typed by the agent. Empty/undefined
 *                  bodies are still logged with "(aucune note)" so the
 *                  timestamped trace remains.
 */
export async function appendClientNote(
  clientId: string | null | undefined,
  header: string,
  body: string | null | undefined,
): Promise<void> {
  if (!clientId) return

  const stamp = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const cleanedBody = (body ?? '').trim()
  const block = `─── ${stamp} — ${header} ───\n${cleanedBody || '(aucune note)'}\n`

  // Single atomic UPDATE inside the RPC — replaces the broken
  // read-modify-write that was here before. RLS on clients applies
  // because the function is SECURITY INVOKER, so an agent can only
  // append to clients in their tenant.
  // RPC signature isn't in database.generated.ts yet — cast via
  // unknown so the call type-checks until types are regenerated.
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args: { p_client_id: string; p_note: string },
  ) => Promise<{ error: { message: string } | null }>)('append_client_note', {
    p_client_id: clientId,
    p_note: block,
  })
  if (error) {
    console.warn('[appendClientNote] RPC failed:', error.message)
  }
}
