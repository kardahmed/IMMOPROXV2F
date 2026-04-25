// Display status derivation for the consolidated tasks table.
//
// The DB enum task_status has only 3 values: pending | done | ignored.
// The /tasks UI used to show 6 states (pending, scheduled, in_progress,
// completed, skipped, cancelled). After migration 028, those 6 are
// preserved logically via auxiliary fields:
//
//   status='pending' + scheduled_at > now()         → "Programmé"
//   status='pending' + executed_at IS NOT NULL      → "En cours"
//   status='pending'                                → "À faire"
//   status='done'                                   → "Fait"
//   status='ignored' + auto_cancelled=true          → "Annulé"
//   status='ignored'                                → "Ignoré"
//
// This module is the single source of truth for that derivation +
// the inverse (when the UI sets a display status, what enum value +
// auxiliary fields should be written).

export type TaskStatusEnum = 'pending' | 'done' | 'ignored'

export type TaskDisplayStatus =
  | 'pending'      // À faire
  | 'scheduled'    // Programmé (future)
  | 'in_progress'  // En cours (started but not done)
  | 'completed'    // Fait
  | 'skipped'      // Ignoré (manually)
  | 'cancelled'    // Annulé (auto-cancelled by system)

interface TaskShape {
  status: TaskStatusEnum | string | null
  scheduled_at?: string | null
  executed_at?: string | null
  auto_cancelled?: boolean | null
  completed_at?: string | null
}

/** Compute the visible status from the enum + auxiliary timestamps. */
export function deriveDisplayStatus(task: TaskShape): TaskDisplayStatus {
  const status = task.status

  if (status === 'done') return 'completed'

  if (status === 'ignored') {
    return task.auto_cancelled ? 'cancelled' : 'skipped'
  }

  // pending bucket — refine via timestamps
  if (task.executed_at) return 'in_progress'
  if (task.scheduled_at) {
    const sched = new Date(task.scheduled_at).getTime()
    if (sched > Date.now()) return 'scheduled'
  }
  return 'pending'
}

/** Inverse: build the DB write payload from a display status. */
export function buildStatusPayload(display: TaskDisplayStatus): {
  status: TaskStatusEnum
  completed_at?: string
  executed_at?: string
  auto_cancelled?: boolean
} {
  const now = new Date().toISOString()
  switch (display) {
    case 'pending':
      return { status: 'pending', auto_cancelled: false }
    case 'scheduled':
      return { status: 'pending', auto_cancelled: false }
    case 'in_progress':
      return { status: 'pending', executed_at: now, auto_cancelled: false }
    case 'completed':
      return { status: 'done', completed_at: now, executed_at: now }
    case 'skipped':
      return { status: 'ignored', auto_cancelled: false }
    case 'cancelled':
      return { status: 'ignored', auto_cancelled: true }
  }
}

/** UI label + colour for a display status. Keep in sync with translations. */
export const DISPLAY_STATUS_META: Record<
  TaskDisplayStatus,
  { label: string; color: 'green' | 'orange' | 'blue' | 'muted' | 'red' }
> = {
  pending:     { label: 'A faire',   color: 'orange' },
  scheduled:   { label: 'Programme', color: 'blue' },
  in_progress: { label: 'En cours',  color: 'blue' },
  completed:   { label: 'Fait',      color: 'green' },
  skipped:     { label: 'Ignore',    color: 'muted' },
  cancelled:   { label: 'Annule',    color: 'red' },
}
