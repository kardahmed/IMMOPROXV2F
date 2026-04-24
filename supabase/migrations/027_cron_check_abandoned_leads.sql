-- ================================================
-- pg_cron schedule for the check-abandoned-leads edge function
--
-- Runs once per hour. The edge function itself decides if a given
-- lead is eligible (step_completed=1 + 6h+ stale + drip_sent_at NULL),
-- so cheap to run hourly even when no leads are pending.
--
-- Idempotent: cron.schedule replaces a job with the same name.
-- Depends on the call_edge_function() helper from 013_consolidate_crons.sql.
-- ================================================

SELECT cron.schedule(
  'check-abandoned-leads-edge',
  '0 * * * *',
  $$SELECT call_edge_function('check-abandoned-leads')$$
);
