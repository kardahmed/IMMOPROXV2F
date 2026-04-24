-- ================================================
-- Phase 4.5 — Expose the remaining 7 plan features as tenant toggles
--
-- Phase 1 (migration 020) added 8 feature_* columns — the "modules"
-- (payment_tracking, charges, documents, goals, landing_pages,
-- ai_scripts, whatsapp, auto_tasks). The other 7 features that live
-- in plan_limits.features (ai_suggestions, ai_documents, ai_custom,
-- export_csv, custom_branding, api_access, roi_marketing) had no
-- tenant override, so the agency admin couldn't turn them off
-- individually — they inherited the plan's choice.
--
-- Product direction: give the tenant admin control over every
-- feature the plan includes, so the agency can shape their own
-- workspace. All defaults TRUE so existing enterprise / pro tenants
-- don't suddenly lose capabilities on migration.
--
-- Every statement is idempotent.
-- ================================================

ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_ai_suggestions   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_ai_documents     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_ai_custom        BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_export_csv       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_custom_branding  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_api_access       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS feature_roi_marketing    BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN tenant_settings.feature_ai_suggestions IS 'Tenant-level toggle for AI unit-matching suggestions. Effective value = plan_limits.features.ai_suggestions AND this column.';
COMMENT ON COLUMN tenant_settings.feature_ai_documents IS 'Tenant-level toggle for AI-generated documents. Effective value = plan_limits.features.ai_documents AND this column.';
COMMENT ON COLUMN tenant_settings.feature_ai_custom IS 'Tenant-level toggle for custom AI prompts. Effective value = plan_limits.features.ai_custom AND this column.';
COMMENT ON COLUMN tenant_settings.feature_export_csv IS 'Tenant-level toggle for CSV exports in reports/pipeline. Effective value = plan_limits.features.export_csv AND this column.';
COMMENT ON COLUMN tenant_settings.feature_custom_branding IS 'Tenant-level toggle for white-label branding (logo, colors). Effective value = plan_limits.features.custom_branding AND this column.';
COMMENT ON COLUMN tenant_settings.feature_api_access IS 'Tenant-level toggle for API access / webhooks. Effective value = plan_limits.features.api_access AND this column.';
COMMENT ON COLUMN tenant_settings.feature_roi_marketing IS 'Tenant-level toggle for the ROI Marketing module. Effective value = plan_limits.features.roi_marketing AND this column.';
