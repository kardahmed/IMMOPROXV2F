-- ════════════════════════════════════════════════════════════════════
-- 073 — Per-tenant call script overrides
-- ════════════════════════════════════════════════════════════════════
-- The default stage prompt context (in code, _shared/
-- stagePromptContext.ts) is one-size-fits-all. Some agencies have
-- their own playbook, tone, or scripts that they want the AI to
-- follow per stage — e.g. a luxury agency phrases the post-sale
-- referral ask very differently from a starter-tier promotion.
--
-- This table lets each tenant override the default stage block
-- with their own free-form instructions. generate-call-script
-- reads from it; if no override exists, it falls back to the
-- code-defined default.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS call_script_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_stage  TEXT NOT NULL CHECK (pipeline_stage IN (
    'accueil', 'visite_a_gerer', 'visite_confirmee', 'visite_terminee',
    'negociation', 'reservation', 'vente', 'relancement', 'perdue'
  )),
  -- Free-form instructions injected into the AI prompt instead of
  -- the default block. Keep it under ~1000 chars to stay token-cheap;
  -- the model will use it as the stage's full guideline.
  custom_instructions TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT call_script_overrides_unique UNIQUE (tenant_id, pipeline_stage)
);

CREATE INDEX IF NOT EXISTS idx_call_script_overrides_tenant_stage
  ON call_script_overrides(tenant_id, pipeline_stage)
  WHERE enabled = TRUE;

-- updated_at trigger
CREATE OR REPLACE FUNCTION call_script_overrides_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_call_script_overrides_updated_at ON call_script_overrides;
CREATE TRIGGER trg_call_script_overrides_updated_at
  BEFORE UPDATE ON call_script_overrides
  FOR EACH ROW EXECUTE FUNCTION call_script_overrides_touch_updated_at();

-- RLS
ALTER TABLE call_script_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_script_overrides_select ON call_script_overrides;
CREATE POLICY call_script_overrides_select ON call_script_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'super_admin'
          OR u.tenant_id = call_script_overrides.tenant_id
        )
    )
  );

DROP POLICY IF EXISTS call_script_overrides_insert ON call_script_overrides;
CREATE POLICY call_script_overrides_insert ON call_script_overrides FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'super_admin'
          OR (u.role = 'admin' AND u.tenant_id = call_script_overrides.tenant_id)
        )
    )
  );

DROP POLICY IF EXISTS call_script_overrides_update ON call_script_overrides;
CREATE POLICY call_script_overrides_update ON call_script_overrides FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'super_admin'
          OR (u.role = 'admin' AND u.tenant_id = call_script_overrides.tenant_id)
        )
    )
  );

DROP POLICY IF EXISTS call_script_overrides_delete ON call_script_overrides;
CREATE POLICY call_script_overrides_delete ON call_script_overrides FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'super_admin'
          OR (u.role = 'admin' AND u.tenant_id = call_script_overrides.tenant_id)
        )
    )
  );

COMMENT ON TABLE call_script_overrides IS
  'Per-tenant overrides for the default stage-aware AI call script context. Read by generate-call-script + ai-suggestions.';
