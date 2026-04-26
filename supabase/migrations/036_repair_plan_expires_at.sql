-- ================================================
-- Repair: ensure plan_expires_at exists on tenants
--
-- Migration 004 was supposed to add this column, but in some installs
-- it was not applied successfully. The get_costs_summary RPC (added
-- in migration 034) references this column and fails with a 400 Bad
-- Request when it's missing. This migration is idempotent and safe to
-- run on installs where the column already exists.
-- ================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
