-- ================================================
-- WhatsApp multi-tenant schema
--
-- Freezes the 4 whatsapp_* tables that were originally created directly
-- in Supabase Studio (so they had no migration trail). Shape inferred
-- from the Edge Functions that read/write them (supabase/functions/
-- whatsapp-signup, send-whatsapp) and the super-admin UI at
-- src/pages/superadmin/WhatsAppPage.tsx.
--
-- Every statement is idempotent: CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE
-- POLICY. Applying this migration against a project where the tables
-- were already created in Studio is safe — the table/index creates
-- become no-ops and the policy block rewrites RLS to match the
-- version-controlled source of truth.
-- ================================================

-- ----------------------------------------
-- whatsapp_config — platform-wide (single active row)
-- Holds the founder's Meta app credentials used to broker the
-- Embedded Signup OAuth exchange for every tenant.
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_app_id TEXT,
  meta_app_secret TEXT,
  access_token TEXT,
  phone_number_id TEXT,
  waba_id TEXT,
  display_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_active ON whatsapp_config(is_active) WHERE is_active;

ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_whatsapp_config" ON whatsapp_config;
CREATE POLICY "super_admin_read_whatsapp_config" ON whatsapp_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  );

DROP POLICY IF EXISTS "super_admin_write_whatsapp_config" ON whatsapp_config;
CREATE POLICY "super_admin_write_whatsapp_config" ON whatsapp_config
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  );

-- ----------------------------------------
-- whatsapp_accounts — one row per tenant
-- Written by the whatsapp-signup Edge Function when a tenant admin
-- completes the Embedded Signup flow. Holds the tenant's own
-- WhatsApp Business credentials + their per-month quota counter.
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number_id TEXT,
  waba_id TEXT,
  display_phone TEXT,
  access_token TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  plan TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter','growth','scale')),
  monthly_quota INTEGER NOT NULL DEFAULT 500,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_tenant ON whatsapp_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_active ON whatsapp_accounts(is_active) WHERE is_active;

ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_own_whatsapp_account" ON whatsapp_accounts;
CREATE POLICY "tenant_read_own_whatsapp_account" ON whatsapp_accounts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE users.id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  );

DROP POLICY IF EXISTS "super_admin_write_whatsapp_accounts" ON whatsapp_accounts;
CREATE POLICY "super_admin_write_whatsapp_accounts" ON whatsapp_accounts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  );

-- ----------------------------------------
-- whatsapp_messages — audit log of every send attempt
-- Written by the send-whatsapp Edge Function on both success and
-- failure. Tenant members see their own tenant's log; super admins
-- see everything.
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  to_phone TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  wa_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','delivered','read','failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_client ON whatsapp_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_own_whatsapp_messages" ON whatsapp_messages;
CREATE POLICY "tenant_read_own_whatsapp_messages" ON whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE users.id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  );

-- Writes always come from the service-role key (send-whatsapp Edge
-- Function), so RLS is bypassed. We still declare a super-admin-only
-- policy for completeness and to keep Studio inserts safe.
DROP POLICY IF EXISTS "super_admin_write_whatsapp_messages" ON whatsapp_messages;
CREATE POLICY "super_admin_write_whatsapp_messages" ON whatsapp_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  );

-- ----------------------------------------
-- whatsapp_templates — platform-level catalogue
-- Curated list of Meta-approved templates available to every tenant.
-- Super admin manages; everyone reads.
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  body_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'utility'
    CHECK (category IN ('utility','marketing','authentication')),
  language TEXT NOT NULL DEFAULT 'fr',
  variables_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status ON whatsapp_templates(status);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_whatsapp_templates" ON whatsapp_templates;
CREATE POLICY "authenticated_read_whatsapp_templates" ON whatsapp_templates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "super_admin_write_whatsapp_templates" ON whatsapp_templates;
CREATE POLICY "super_admin_write_whatsapp_templates" ON whatsapp_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
  );

-- ----------------------------------------
-- updated_at triggers — keep mutation timestamps fresh
-- ----------------------------------------
CREATE OR REPLACE FUNCTION update_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whatsapp_config_updated_at ON whatsapp_config;
CREATE TRIGGER whatsapp_config_updated_at
  BEFORE UPDATE ON whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

DROP TRIGGER IF EXISTS whatsapp_accounts_updated_at ON whatsapp_accounts;
CREATE TRIGGER whatsapp_accounts_updated_at
  BEFORE UPDATE ON whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

DROP TRIGGER IF EXISTS whatsapp_templates_updated_at ON whatsapp_templates;
CREATE TRIGGER whatsapp_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

COMMENT ON TABLE whatsapp_config IS 'Platform-wide Meta Cloud API credentials used to broker the Embedded Signup OAuth exchange for every tenant. Single active row expected.';
COMMENT ON TABLE whatsapp_accounts IS 'Per-tenant WhatsApp Business credentials + quota counter. Populated by the whatsapp-signup Edge Function on Embedded Signup completion.';
COMMENT ON TABLE whatsapp_messages IS 'Audit log of every send attempt via the send-whatsapp Edge Function (both success and failure).';
COMMENT ON TABLE whatsapp_templates IS 'Curated platform-level catalogue of Meta-approved message templates available to every tenant.';
