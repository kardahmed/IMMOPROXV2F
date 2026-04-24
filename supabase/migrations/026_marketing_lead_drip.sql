-- ================================================
-- Email drip — track when an abandoned-lead drip has been sent
--
-- A "drip" lead = filled step 1 of /contact (name/email/phone) but
-- never completed step 2 (qualification). The check-abandoned-leads
-- cron looks for these every hour and sends ONE re-engagement email
-- after 6h of inactivity. This column is what stops the same email
-- from going out twice.
--
-- NULL = no drip sent yet (eligible if step_completed=1 + 6h+ stale)
-- TIMESTAMPTZ = drip sent at that timestamp
--
-- Idempotent.
-- ================================================

ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS drip_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN marketing_leads.drip_sent_at IS
  'Timestamp when the abandoned-lead re-engagement email was sent. NULL = never sent. The check-abandoned-leads cron sets this after a successful send so the same lead is not re-emailed every cron run.';

-- Speed up the cron query: we filter on (step_completed, drip_sent_at, status, created_at)
CREATE INDEX IF NOT EXISTS idx_marketing_leads_drip_eligible
  ON marketing_leads (created_at)
  WHERE step_completed = 1 AND drip_sent_at IS NULL;
