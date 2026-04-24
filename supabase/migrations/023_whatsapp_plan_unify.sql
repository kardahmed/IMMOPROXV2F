-- ================================================
-- Phase 5 — Unify WhatsApp quota with the tenant plan
--
-- Before: whatsapp_accounts had its own 3-tier pricing (starter /
-- growth / scale) via a `plan` column + a separate `whatsapp_plans`
-- table used by the /settings → WhatsApp screen to show "Packs
-- disponibles". That meant a tenant on Enterprise still saw packs at
-- 5000 / 12000 / 25000 DA and had to "subscribe" to one — double
-- billing in concept, confusing UX (see El Fatha screenshot, Phase 5
-- audit).
--
-- After: whatsapp quota comes directly from the tenant's main plan
-- (plan_limits.max_whatsapp_messages). When the super admin upgrades
-- a tenant via /admin/plans, the WhatsApp quota updates with it
-- (propagation trigger arrives in Phase 6).
--
-- This migration:
--   1. Adds max_whatsapp_messages to plan_limits with sensible
--      defaults per tier. Uses `UPDATE … WHERE NOT EXISTS key` via
--      COALESCE so any value the super admin has already tuned is
--      preserved. Uses -1 to mean "unlimited" (like max_ai_tokens).
--   2. Backfills whatsapp_accounts.monthly_quota for every existing
--      row, using the tenant's current plan as the source of truth.
--   3. Drops the CHECK constraint on whatsapp_accounts.plan so
--      future inserts aren't tied to the legacy 3-tier vocabulary.
--      The column itself stays for now (backward compat with
--      whatsapp-signup Edge Function) — a follow-up PR can drop it
--      entirely once we've deployed + verified.
--
-- Every statement is idempotent.
-- ================================================

-- 1. Add plan quota column
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS max_whatsapp_messages INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN plan_limits.max_whatsapp_messages IS 'Monthly WhatsApp message quota included with this plan. -1 = unlimited. 0 = WhatsApp not included (the whatsapp feature flag should also be false for this plan).';

-- 2. Seed per-plan quotas (only if currently at default 0, i.e. never set)
UPDATE plan_limits SET max_whatsapp_messages = 0
  WHERE plan = 'free' AND max_whatsapp_messages = 0;
UPDATE plan_limits SET max_whatsapp_messages = 0
  WHERE plan = 'starter' AND max_whatsapp_messages = 0;
UPDATE plan_limits SET max_whatsapp_messages = 2000
  WHERE plan = 'pro' AND max_whatsapp_messages = 0;
UPDATE plan_limits SET max_whatsapp_messages = -1
  WHERE plan = 'enterprise' AND max_whatsapp_messages = 0;

-- 3. Drop the legacy CHECK constraint so we can bypass the
-- starter/growth/scale vocabulary.
ALTER TABLE whatsapp_accounts DROP CONSTRAINT IF EXISTS whatsapp_accounts_plan_check;

-- 4. Backfill whatsapp_accounts.monthly_quota from each tenant's
-- current plan. -1 stored as a very large int (999999) so numeric
-- comparisons (messages_sent < monthly_quota) still work.
UPDATE whatsapp_accounts wa
SET monthly_quota = CASE
  WHEN pl.max_whatsapp_messages = -1 THEN 999999
  ELSE pl.max_whatsapp_messages
END
FROM tenants t
JOIN plan_limits pl ON pl.plan = t.plan
WHERE wa.tenant_id = t.id
  AND pl.max_whatsapp_messages > 0;
