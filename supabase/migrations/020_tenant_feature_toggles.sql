-- ================================================
-- Phase 1 — Tenant feature toggles
--
-- The settings UI (src/pages/settings/sections/FeaturesSection.tsx)
-- reads and writes 8 feature_* boolean columns on tenant_settings
-- to let tenant admins turn features on/off for their agency.
--
-- Problem: these columns never existed. The read silently returned
-- null (so every toggle showed `true` by default) and the write was
-- silently ignored, meaning toggles never persisted.
--
-- This migration creates them all with DEFAULT TRUE so existing
-- tenants inherit every feature enabled (no regression), then the
-- plan-gating logic (Phase 3/4) can clamp them based on plan_limits.
--
-- Every statement is idempotent.
-- ================================================

ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_payment_tracking BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_charges BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_documents BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_goals BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_landing_pages BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_ai_scripts BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_whatsapp BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_auto_tasks BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN tenant_settings.feature_payment_tracking IS 'Tenant-level toggle for payment schedules + late payment reminders. Effective value = plan_limits.features.payment_tracking AND this column.';
COMMENT ON COLUMN tenant_settings.feature_charges IS 'Tenant-level toggle for notary/agency charges module. Effective value = plan_limits.features.charges AND this column.';
COMMENT ON COLUMN tenant_settings.feature_documents IS 'Tenant-level toggle for PDF contract/receipt generation. Effective value = plan_limits.features.pdf_generation AND this column.';
COMMENT ON COLUMN tenant_settings.feature_goals IS 'Tenant-level toggle for agent sales goals. Effective value = plan_limits.features.goals AND this column.';
COMMENT ON COLUMN tenant_settings.feature_landing_pages IS 'Tenant-level toggle for public landing pages. Effective value = plan_limits.features.landing_pages AND this column.';
COMMENT ON COLUMN tenant_settings.feature_ai_scripts IS 'Tenant-level toggle for AI-generated call scripts. Effective value = plan_limits.features.ai_scripts AND this column.';
COMMENT ON COLUMN tenant_settings.feature_whatsapp IS 'Tenant-level toggle for outbound WhatsApp automations. Effective value = plan_limits.features.whatsapp AND whatsapp_accounts.is_active AND this column.';
COMMENT ON COLUMN tenant_settings.feature_auto_tasks IS 'Tenant-level toggle for cron-generated automatic tasks. Effective value = plan_limits.features.auto_tasks AND this column.';
