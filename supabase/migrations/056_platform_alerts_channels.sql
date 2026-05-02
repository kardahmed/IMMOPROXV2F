-- ============================================================================
-- 056_platform_alerts_channels.sql
--
-- Hot-fix: the platform_alerts.channel CHECK constraint only allowed
-- 'email' and 'telegram'. The send-alert edge function (cleaned up in
-- the Big-4 audit + extended in 055) actually supports slack, discord
-- and a generic webhook channel too, but inserting any of those from
-- the UI fails with platform_alerts_channel_check.
--
-- Drop and re-create the constraint so the DB matches reality.
-- ============================================================================

ALTER TABLE platform_alerts
  DROP CONSTRAINT IF EXISTS platform_alerts_channel_check;

ALTER TABLE platform_alerts
  ADD CONSTRAINT platform_alerts_channel_check
  CHECK (channel IN ('email', 'telegram', 'slack', 'discord', 'webhook'));
