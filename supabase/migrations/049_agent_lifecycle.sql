-- 049_agent_lifecycle.sql
-- ────────────────────────────────────────────────────────────────────
-- Phase 9 — Agent lifecycle (congé, suspension, départ).
--
-- Today users.status only has 'active' and 'inactive'. Real life on
-- an Algerian agency has 4 distinct cases:
--
--   active     — works normally, gets new lead assignments
--   on_leave   — temporarily off (vacation, médical) for a known
--                window. Login allowed (so they can catch up when
--                they return), but excluded from round-robin /
--                touchpoints. A backup agent can cover their clients.
--   suspended  — login blocked for an HR reason, indeterminate end.
--                Their clients become admin's responsibility.
--   inactive   — left the agency (resignation, termination). All
--                their clients/tasks/visits got reassigned to other
--                agents through the deactivation wizard. Account
--                kept for audit (sales, history) but login dead.
--
-- This migration:
--   1. Extends user_status enum with the two new values.
--   2. Adds leave_starts_at / leave_ends_at / backup_agent_id /
--      leave_reason on users so a tenant can plan a leave with a
--      defined return date and a substitute.
--   3. Adds an index on (status, leave_ends_at) for the cron that
--      auto-reactivates agents when their leave_ends_at passes.
--   4. Schedules the auto-reactivate-agents edge function via
--      pg_cron (hourly).
-- ────────────────────────────────────────────────────────────────────

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- 1. Extend user_status enum.
-- ════════════════════════════════════════════════════════════════════
-- ADD VALUE IF NOT EXISTS so this migration is idempotent.

ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'on_leave';
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'suspended';

-- ════════════════════════════════════════════════════════════════════
-- 2. Lifecycle columns on users.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS leave_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leave_ends_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS backup_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leave_reason    TEXT;

COMMENT ON COLUMN users.leave_starts_at IS
  'Start of a planned leave window. Set by AgentsPage when an admin '
  'flips the agent to on_leave.';

COMMENT ON COLUMN users.leave_ends_at IS
  'Scheduled return date. The auto-reactivate-agents cron flips '
  'status back to ''active'' when NOW() crosses this timestamp.';

COMMENT ON COLUMN users.backup_agent_id IS
  'Substitute agent who should be alerted of incoming activity on '
  'this agent''s clients during their leave. Currently informational; '
  'the inbox / tasks views surface it to the cover agent.';

COMMENT ON COLUMN users.leave_reason IS
  'Free-form text — "Congé annuel", "Arrêt maladie", etc. Visible '
  'only to admin / super_admin on the agents page.';

-- ════════════════════════════════════════════════════════════════════
-- 3. Index for the cron's hourly scan.
-- ════════════════════════════════════════════════════════════════════
-- Only scan rows that COULD become active again. A partial index keeps
-- it tiny (only on_leave rows with a future return date).

CREATE INDEX IF NOT EXISTS idx_users_leave_ending
  ON users (leave_ends_at)
  WHERE status = 'on_leave' AND leave_ends_at IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- 4. pg_cron: auto-reactivate-agents — runs every hour at :30 (offset
--    from the existing crons at :00 / :15 / :45 to spread load).
-- ════════════════════════════════════════════════════════════════════
-- Idempotent — cron.schedule replaces a job with the same name.
-- Depends on call_edge_function() from 013_consolidate_crons.sql.

SELECT cron.schedule(
  'auto-reactivate-agents-edge',
  '30 * * * *',
  $$SELECT call_edge_function('auto-reactivate-agents')$$
);

COMMIT;
