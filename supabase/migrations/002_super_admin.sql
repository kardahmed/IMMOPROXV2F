-- ================================================
-- P00-A: Super Admin infrastructure
-- ================================================

-- 1. Allow tenant_id NULL for super_admin
ALTER TABLE users ALTER COLUMN tenant_id DROP NOT NULL;

-- Constraint: admin and agent MUST have a tenant_id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_tenant_required'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT check_tenant_required
    CHECK (role = 'super_admin' OR tenant_id IS NOT NULL);
  END IF;
END $$;

-- 2. Super Admin logs table
CREATE TABLE IF NOT EXISTS super_admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  tenant_id UUID REFERENCES tenants(id),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_super_admin_logs_admin ON super_admin_logs(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_logs_tenant ON super_admin_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_logs_created ON super_admin_logs(created_at DESC);

-- No RLS on super_admin_logs — accessed only via service role or super_admin policies
ALTER TABLE super_admin_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'super_admin_logs_super_admin_all') THEN
    CREATE POLICY "super_admin_logs_super_admin_all" ON super_admin_logs
      FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
      );
  END IF;
END $$;

-- 3. Platform settings table
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT DEFAULT 'IMMO PRO-X',
  version TEXT DEFAULT 'v2.0',
  support_email TEXT DEFAULT '',
  maintenance_mode BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'platform_settings_super_admin_all') THEN
    CREATE POLICY "platform_settings_super_admin_all" ON platform_settings
      FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'platform_settings_read_all') THEN
    CREATE POLICY "platform_settings_read_all" ON platform_settings
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Insert default row
INSERT INTO platform_settings (platform_name, version, support_email, maintenance_mode)
VALUES ('IMMO PRO-X', 'v2.0', '', FALSE)
ON CONFLICT DO NOTHING;
