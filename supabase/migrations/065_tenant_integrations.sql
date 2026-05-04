-- ════════════════════════════════════════════════════════════════════
-- 065 — Per-tenant integrations (Resend first, more types later)
-- ════════════════════════════════════════════════════════════════════
-- IMMO PRO-X is moving from a single-key model (founder's RESEND_API_KEY
-- relays every tenant's outbound email) to per-tenant credentials. At
-- 10+ tenants the founder's quota is everyone's bottleneck and the
-- "From: noreply@immoprox.io" branding is unprofessional for an
-- algerian agency emailing its own clients. Each tenant signs up at
-- Resend, verifies their own domain (DNS in their nameservers), and
-- pastes the resulting key here.
--
-- Isolation requirements:
--   1. A tenant admin can configure / rotate / delete THEIR integration.
--   2. A tenant admin must NEVER be able to read another tenant's row.
--   3. A regular agent (role='agent') has no business touching
--      integrations at all.
--   4. The api_key column must NEVER reach the browser, even for the
--      tenant admin who set it (they can rotate but not re-read).
--   5. Edge Functions running with the service role bypass all of the
--      above (that's the only path that's allowed to read api_key).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('resend', 'meta_pixel', 'google_analytics', 'tiktok_pixel')),
  api_key TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  last_test_at TIMESTAMPTZ,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT tenant_integrations_unique UNIQUE (tenant_id, type)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant_type
  ON tenant_integrations(tenant_id, type);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_enabled
  ON tenant_integrations(tenant_id) WHERE enabled = TRUE;

-- updated_at trigger so freshness is tracked
CREATE OR REPLACE FUNCTION tenant_integrations_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_integrations_updated_at ON tenant_integrations;
CREATE TRIGGER trg_tenant_integrations_updated_at
  BEFORE UPDATE ON tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION tenant_integrations_touch_updated_at();

-- ── Column-level grants ─────────────────────────────────────────────
-- The whole point of column GRANTs here is to make api_key
-- *unreadable* to the authenticated role even before RLS runs. A
-- malicious tenant admin who guesses the column name and tries
-- `select api_key from tenant_integrations` gets a permission error
-- from Postgres directly, not just empty rows.
REVOKE ALL ON tenant_integrations FROM authenticated, anon;

GRANT SELECT
  (id, tenant_id, type, config, enabled, verified_at,
   last_test_at, last_test_error, created_at, updated_at, created_by)
  ON tenant_integrations TO authenticated;

GRANT INSERT
  (tenant_id, type, api_key, config, enabled, created_by)
  ON tenant_integrations TO authenticated;

GRANT UPDATE
  (api_key, config, enabled, verified_at, last_test_at, last_test_error)
  ON tenant_integrations TO authenticated;

GRANT DELETE ON tenant_integrations TO authenticated;

-- ── Row Level Security ──────────────────────────────────────────────
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_integrations FORCE ROW LEVEL SECURITY;

-- SELECT: tenant admin sees their tenant's rows; super_admin sees all.
CREATE POLICY tenant_integrations_select ON tenant_integrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'super_admin'
          OR (u.role = 'admin' AND u.tenant_id = tenant_integrations.tenant_id)
        )
    )
  );

CREATE POLICY tenant_integrations_insert ON tenant_integrations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'super_admin'
          OR (u.role = 'admin' AND u.tenant_id = tenant_integrations.tenant_id)
        )
    )
  );

CREATE POLICY tenant_integrations_update ON tenant_integrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'super_admin'
          OR (u.role = 'admin' AND u.tenant_id = tenant_integrations.tenant_id)
        )
    )
  )
  WITH CHECK (
    -- Reaffirm tenant_id on UPDATE so a hostile admin can't change
    -- their integration's tenant_id to point at someone else.
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY tenant_integrations_delete ON tenant_integrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role = 'super_admin'
          OR (u.role = 'admin' AND u.tenant_id = tenant_integrations.tenant_id)
        )
    )
  );

COMMENT ON TABLE tenant_integrations IS
  'Per-tenant credentials for external services (Resend, Meta Pixel, ...). api_key column is REVOKEd from authenticated; only Edge Functions running as service_role can read it.';

COMMENT ON COLUMN tenant_integrations.api_key IS
  'Secret. NEVER selectable by authenticated role. Only the Edge Functions (service_role) read it when sending on behalf of the tenant.';

COMMENT ON COLUMN tenant_integrations.config IS
  'Non-secret per-integration settings. For type=resend: { from_email, from_name, reply_to }. For type=meta_pixel: { pixel_id, test_event_code, ... }.';
