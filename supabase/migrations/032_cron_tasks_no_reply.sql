-- ================================================
-- Migration 032 — schedule check-tasks-no-reply hourly
--
-- Third leg of step C (task↔reality loop). Runs every hour.
-- The Edge Function picks up pending tasks where:
--   - executed_at IS NOT NULL (agent sent the message)
--   - executed_at < NOW() - 48h
--   - status = 'pending' (not done, not already cancelled)
--   - auto_cancelled IS NOT TRUE
--   - deleted_at IS NULL
-- ... and either:
--   - re-closes them as 'done' if a late inbound reply is found
--     (race condition recovery vs the webhook), or
--   - cancels the original + creates a relance task on a different
--     channel (whatsapp → call, others → whatsapp), priority='high'
--
-- Idempotent: cron.schedule replaces a job with the same name. Depends
-- on the call_edge_function() helper from 013_consolidate_crons.sql.
-- ================================================

SELECT cron.schedule(
  'check-tasks-no-reply-hourly',
  '0 * * * *',
  $$SELECT call_edge_function('check-tasks-no-reply')$$
);

-- ================================================
-- Verification
-- ================================================
--   SELECT jobid, jobname, schedule, command
--     FROM cron.job
--    WHERE jobname = 'check-tasks-no-reply-hourly';
-- → should return 1 row with schedule '0 * * * *' and the call_edge_function command.
--
-- Manual trigger (don't wait for the next hour):
--   SELECT call_edge_function('check-tasks-no-reply');
-- Then check Edge Function logs:
--   https://supabase.com/dashboard/project/lbnqccsebwiifxcucflg/functions/check-tasks-no-reply/logs
--
-- Expected output: { ok: true, candidates: N, closed_after_late_reply: N,
--                    relanced: N, errors: [] }
--
-- ================================================
-- Rollback
-- ================================================
--   SELECT cron.unschedule('check-tasks-no-reply-hourly');
