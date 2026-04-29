-- 047_stage_tracking_for_automations.sql
-- ────────────────────────────────────────────────────────────────────
-- Phase 7 Sprint A.3 needs to know WHEN each client entered their
-- current pipeline_stage so the cron can fire stage-based time
-- touchpoints (e.g. accueil_call_qualification at J+1, negociation_
-- expiration at J+7). Migrations 001 and 010 only logged stage
-- transitions in the `history` table — fine for audit but expensive
-- to query in a cron loop ("for every client, find the most recent
-- stage_change history row").
--
-- This migration:
--   1. Adds clients.pipeline_stage_changed_at TIMESTAMPTZ.
--   2. Backfills it from each client's most recent stage_change
--      history row, falling back to created_at when no history.
--   3. Adds a BEFORE UPDATE trigger that bumps it whenever
--      pipeline_stage actually changes (matches the existing
--      log_stage_change trigger pattern).
--   4. Indexes (tenant_id, pipeline_stage, pipeline_stage_changed_at)
--      so the cron's per-stage scan stays fast as the table grows.
-- ────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pipeline_stage_changed_at TIMESTAMPTZ;

-- Backfill: use the most recent stage_change history entry for each
-- client; fall back to created_at if no history exists yet.
UPDATE clients c
SET pipeline_stage_changed_at = COALESCE(
  (
    SELECT h.created_at
    FROM history h
    WHERE h.client_id = c.id
      AND h.type = 'stage_change'
    ORDER BY h.created_at DESC
    LIMIT 1
  ),
  c.created_at,
  NOW()
)
WHERE pipeline_stage_changed_at IS NULL;

-- Make NOT NULL after backfill so the cron can rely on it.
ALTER TABLE clients
  ALTER COLUMN pipeline_stage_changed_at SET NOT NULL,
  ALTER COLUMN pipeline_stage_changed_at SET DEFAULT NOW();

-- Trigger: bump on actual stage change (not on every UPDATE — pure
-- column inequality so unrelated edits like name fixes don't reset
-- the touchpoint window).
CREATE OR REPLACE FUNCTION trigger_clients_stage_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage THEN
    NEW.pipeline_stage_changed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_stage_changed_at_trg ON clients;
CREATE TRIGGER clients_stage_changed_at_trg
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION trigger_clients_stage_changed_at();

-- Index for the cron's per-stage time scan.
CREATE INDEX IF NOT EXISTS idx_clients_stage_window
  ON clients (tenant_id, pipeline_stage, pipeline_stage_changed_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN clients.pipeline_stage_changed_at IS
  'Timestamp of the last actual pipeline_stage change. Used by the '
  'check-stage-touchpoints cron to fire time-based touchpoints like '
  '"accueil_call_qualification at J+1" or "negociation_expiration at '
  'J+7" without scanning the history table on every tick.';

-- ════════════════════════════════════════════════════════════════════
-- pg_cron schedule for check-stage-touchpoints
-- ════════════════════════════════════════════════════════════════════
-- Runs every hour. The edge function picks up clients whose
-- pipeline_stage_changed_at lands in the right window for each
-- catalogued touchpoint and calls dispatchAutomation. Because
-- dispatchAutomation has its own (tenant, automation_type, related_id)
-- idempotency guard, hourly re-runs never double-fire.
--
-- Idempotent — cron.schedule replaces a job with the same name.
-- Depends on call_edge_function() from 013_consolidate_crons.sql.

SELECT cron.schedule(
  'check-stage-touchpoints-edge',
  '15 * * * *',  -- every hour at :15 to spread load with the other crons
  $$SELECT call_edge_function('check-stage-touchpoints')$$
);

COMMIT;
