-- ════════════════════════════════════════════════════════════════════
-- 074 — Global stage overrides on global_playbook
-- ════════════════════════════════════════════════════════════════════
-- Migration 073 created call_script_overrides (per-tenant). Wrong model:
-- the call-script "secret sauce" is the founder's IP — tenants must
-- not see/edit it, and improvements should propagate to ALL tenants
-- instantly when the founder tweaks the prompt.
--
-- Fold it into the existing global_playbook singleton: a JSONB column
-- keyed by pipeline_stage. Read by generate-call-script (and any other
-- AI feature that wants stage context). Edited only via the super
-- admin Playbook page.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE global_playbook
  ADD COLUMN IF NOT EXISTS stage_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN global_playbook.stage_overrides IS
  'JSONB map keyed by pipeline_stage (accueil, visite_a_gerer, …, perdue). Each value is a free-form text instruction injected into the AI prompt for that stage. Edited by super_admin only.';

-- Drop the per-tenant table created in 073 — wrong model.
DROP TABLE IF EXISTS call_script_overrides CASCADE;
