-- ================================================
-- Phase 2 — Seed every platform feature into plan_limits
--
-- Migration 004 only seeded 5 features (pdf_generation, ai_suggestions,
-- export_csv, custom_branding, api_access) into plan_limits.features,
-- but the admin UI at /admin/plans expects 15 features to toggle per
-- plan. The missing 10 keys silently evaluate to `false` for every
-- tenant, which is why El Fatha (enterprise) sees "WhatsApp inactif"
-- and why features like auto_tasks / payment_tracking / goals were
-- never gateable.
--
-- This migration ensures every plan has an explicit value for every
-- feature key, with sensible defaults per tier:
--
--   free       — everything off (read-only starter experience)
--   starter    — core workflow on, AI + WhatsApp off
--   pro        — AI + WhatsApp on, enterprise-only features off
--   enterprise — everything on
--
-- It uses `defaults || existing` which means any key the super admin
-- has already customised via /admin/plans is PRESERVED. Only missing
-- keys get filled in with the defaults. Re-running this migration is
-- a safe no-op — it never overwrites explicit values.
-- ================================================

-- free — nothing, so the "upgrade" path is obvious
UPDATE plan_limits SET features = jsonb_build_object(
  'pdf_generation',    false,
  'ai_suggestions',    false,
  'ai_scripts',        false,
  'ai_documents',      false,
  'ai_custom',         false,
  'export_csv',        false,
  'custom_branding',   false,
  'api_access',        false,
  'landing_pages',     false,
  'whatsapp',          false,
  'payment_tracking',  false,
  'auto_tasks',        false,
  'goals',             false,
  'charges',           false,
  'roi_marketing',     false
) || COALESCE(features, '{}'::jsonb)
WHERE plan = 'free';

-- starter — core CRM + PDF + landing, no AI / WhatsApp / auto-tasks
UPDATE plan_limits SET features = jsonb_build_object(
  'pdf_generation',    true,
  'ai_suggestions',    false,
  'ai_scripts',        false,
  'ai_documents',      false,
  'ai_custom',         false,
  'export_csv',        true,
  'custom_branding',   false,
  'api_access',        false,
  'landing_pages',     true,
  'whatsapp',          false,
  'payment_tracking',  true,
  'auto_tasks',        false,
  'goals',             true,
  'charges',           true,
  'roi_marketing',     false
) || COALESCE(features, '{}'::jsonb)
WHERE plan = 'starter';

-- pro — everything except enterprise-only (branding, api, ai_documents, ai_custom, roi_marketing)
UPDATE plan_limits SET features = jsonb_build_object(
  'pdf_generation',    true,
  'ai_suggestions',    true,
  'ai_scripts',        true,
  'ai_documents',      false,
  'ai_custom',         false,
  'export_csv',        true,
  'custom_branding',   false,
  'api_access',        false,
  'landing_pages',     true,
  'whatsapp',          true,
  'payment_tracking',  true,
  'auto_tasks',        true,
  'goals',             true,
  'charges',           true,
  'roi_marketing',     false
) || COALESCE(features, '{}'::jsonb)
WHERE plan = 'pro';

-- enterprise — everything unlocked
UPDATE plan_limits SET features = jsonb_build_object(
  'pdf_generation',    true,
  'ai_suggestions',    true,
  'ai_scripts',        true,
  'ai_documents',      true,
  'ai_custom',         true,
  'export_csv',        true,
  'custom_branding',   true,
  'api_access',        true,
  'landing_pages',     true,
  'whatsapp',          true,
  'payment_tracking',  true,
  'auto_tasks',        true,
  'goals',             true,
  'charges',           true,
  'roi_marketing',     true
) || COALESCE(features, '{}'::jsonb)
WHERE plan = 'enterprise';
