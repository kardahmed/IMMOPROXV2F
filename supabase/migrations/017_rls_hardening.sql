-- ================================================
-- Migration 017: RLS hardening
-- Enables RLS on all tables introduced in 011 that missed it, plus audit fixes.
-- ================================================

-- ============ plan_limits (read by everyone, write super-admin only) ============
ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_limits_read_all" ON plan_limits
  FOR SELECT USING (true);

CREATE POLICY "plan_limits_super_admin_write" ON plan_limits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============ invoices (tenant reads own, super-admin everything) ============
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_tenant_read" ON invoices
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "invoices_super_admin_all" ON invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============ platform_messages (tenant reads own + broadcast; super-admin writes) ============
ALTER TABLE platform_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_messages_tenant_read" ON platform_messages
  FOR SELECT USING (
    tenant_id IS NULL OR tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "platform_messages_super_admin_all" ON platform_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============ changelogs (public read, super-admin write) ============
ALTER TABLE changelogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "changelogs_read_all" ON changelogs
  FOR SELECT USING (true);

CREATE POLICY "changelogs_super_admin_write" ON changelogs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============ support_tickets (tenant owner + super-admin) ============
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_tenant" ON support_tickets
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "support_tickets_super_admin" ON support_tickets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============ ticket_messages (through ticket tenant) ============
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_messages_tenant" ON ticket_messages
  FOR ALL USING (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY "ticket_messages_super_admin" ON ticket_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============ platform_alerts (super-admin only) ============
ALTER TABLE platform_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_alerts_super_admin" ON platform_alerts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============ login_attempts (server-side rate limiting) ============
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, attempted_at DESC);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/read (edge functions)
CREATE POLICY "login_attempts_super_admin_read" ON login_attempts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Purge attempts older than 30 days (run by cron or manually)
CREATE OR REPLACE FUNCTION purge_old_login_attempts() RETURNS void
LANGUAGE sql AS $$
  DELETE FROM login_attempts WHERE attempted_at < now() - interval '30 days';
$$;
