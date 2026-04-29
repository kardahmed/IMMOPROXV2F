// Single helper for appending a timestamped entry to clients.notes.
//
// The Notes tab on the client detail page renders the free-form
// `clients.notes` TEXT column. The audit on 29-04-2026 found that
// many UI surfaces capture notes (CallModeOverlay outcomes, visit
// feedback in SmartStageDialog, message bodies in WhatsAppButton,
// task responses in TaskDetailModal, etc.) but those notes never
// landed back in the Notes tab — agents had to retype them there or
// dig through the History feed to find old context.
//
// Every surface that captures any free-text response from / about a
// client should call appendClientNote() here. Newest entries land at
// the top, separated by a blank line, so scrolling down in the Notes
// tab walks chronologically backwards. The agent can still edit the
// notes freely afterwards — this only PREPENDS, never overwrites.

import { supabase } from './supabase'

/**
 * Prepend a timestamped block to clients.notes.
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

  const { data: row, error: readErr } = await supabase
    .from('clients')
    .select('notes')
    .eq('id', clientId)
    .single()
  if (readErr) {
    console.warn('[appendClientNote] read failed:', readErr.message)
    return
  }

  const existing = (row as { notes?: string | null } | null)?.notes ?? ''
  const stamp = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const cleanedBody = (body ?? '').trim()
  const block = `─── ${stamp} — ${header} ───\n${cleanedBody || '(aucune note)'}\n`
  const next = existing ? `${block}\n${existing}` : block

  const { error: writeErr } = await supabase
    .from('clients')
    .update({ notes: next } as never)
    .eq('id', clientId)
  if (writeErr) {
    console.warn('[appendClientNote] write failed:', writeErr.message)
  }
}
