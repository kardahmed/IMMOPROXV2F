-- ================================================
-- Migration 016: Manual billing — payment requests + bank info
-- All payments are handled manually (cash / bank transfer / WhatsApp)
-- Online payment integration deferred.
-- ================================================

-- ============ Platform-level billing config ============
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS billing_whatsapp TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS bank_rib TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS bank_iban TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS bank_swift TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS billing_instructions TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ccp_account TEXT;

-- Set default WhatsApp from existing copy in marketing
UPDATE platform_settings
SET billing_whatsapp = COALESCE(billing_whatsapp, '213542766068'),
    bank_account_holder = COALESCE(bank_account_holder, 'IMMO PRO-X SARL'),
    billing_instructions = COALESCE(billing_instructions,
      'Apres virement, envoyez la preuve par WhatsApp pour activation immediate.')
WHERE id IN (SELECT id FROM platform_settings LIMIT 1);

-- ============ Plan catalog (price reference, stored on platform) ============
CREATE TABLE IF NOT EXISTS plan_prices (
  plan TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  price_monthly_da NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_yearly_da NUMERIC(12,2) NOT NULL DEFAULT 0,
  features JSONB DEFAULT '[]',
  active BOOLEAN DEFAULT TRUE,
  display_order INT DEFAULT 0
);

INSERT INTO plan_prices (plan, label, price_monthly_da, price_yearly_da, display_order, features) VALUES
  ('free', 'Free', 0, 0, 0, '["2 agents","1 projet","20 unites","50 clients"]'),
  ('starter', 'Starter', 9900, 99000, 1, '["5 agents","3 projets","100 unites","Suggestions IA","Export CSV"]'),
  ('pro', 'Pro', 19900, 199000, 2, '["15 agents","10 projets","500 unites","Scripts IA","Landing pages","PDF"]'),
  ('enterprise', 'Enterprise', 0, 0, 3, '["Agents illimites","Projets illimites","Unites illimitees","IA complete","Branding","API"]')
ON CONFLICT (plan) DO NOTHING;

ALTER TABLE plan_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_prices_read_all" ON plan_prices FOR SELECT USING (true);
CREATE POLICY "plan_prices_super_admin_write" ON plan_prices FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============ Payment requests (manual workflow) ============
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'ccp', 'whatsapp', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_request_status AS ENUM ('pending', 'awaiting_proof', 'confirmed', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly', -- monthly | yearly
  amount_da NUMERIC(12,2) NOT NULL,
  method payment_method NOT NULL,
  status payment_request_status NOT NULL DEFAULT 'pending',
  reference TEXT, -- bank transfer reference, receipt #, etc.
  proof_url TEXT, -- uploaded screenshot
  notes TEXT, -- tenant-side message
  admin_notes TEXT,
  whatsapp_message_sent BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ -- auto-cancel after N days
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_tenant ON payment_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_created ON payment_requests(created_at DESC);

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their tenant's requests
CREATE POLICY "tenant_payment_requests_select" ON payment_requests
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Tenant admins can insert their own
CREATE POLICY "tenant_payment_requests_insert" ON payment_requests
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- Tenant admins can update only their own pending requests (cancel)
CREATE POLICY "tenant_payment_requests_update_own" ON payment_requests
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- Super admins can do everything
CREATE POLICY "payment_requests_super_admin" ON payment_requests
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- ============ Subscription history (each confirmed payment extends plan) ============
CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_request_id UUID REFERENCES payment_requests(id) ON DELETE SET NULL,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  amount_da NUMERIC(12,2) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_history_tenant ON subscription_history(tenant_id, period_end DESC);

ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_history_select" ON subscription_history
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "subscription_history_super_admin" ON subscription_history
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));
