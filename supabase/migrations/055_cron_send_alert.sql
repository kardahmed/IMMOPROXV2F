-- ============================================================================
-- 055_cron_send_alert.sql
--
-- Schedule the send-alert edge function to run hourly. send-alert
-- iterates platform_alerts (active=true) and fires Slack/Telegram/
-- Discord/email/webhook notifications when thresholds are met.
--
-- Hourly is fine — every alert type already filters on a "last 24h" or
-- "current minute" window, so frequency just decides how quickly the
-- founder is paged. Hourly buys responsive paging without burning the
-- worker pool.
--
-- Depends on the call_edge_function() helper from 013_consolidate_crons.sql.
-- ============================================================================

SELECT cron.schedule(
  'send-alert-edge',
  '5 * * * *',  -- 5 minutes past every hour
  $$SELECT call_edge_function('send-alert')$$
);
