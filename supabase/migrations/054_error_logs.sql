-- ============================================================================
-- 054_error_logs.sql
--
-- Tenant-side error capture. The ErrorBoundary component logs every
-- React crash here so the founder can see what's breaking in
-- production without paying for Sentry.
--
-- - Anyone authenticated can INSERT (the error happened to them).
-- - Only super_admin can SELECT (you).
-- - tenant_id is null for super-admin sessions outside a tenant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS error_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message         TEXT NOT NULL,
  stack           TEXT,
  component_stack TEXT,
  url             TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_tenant_at ON error_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_logs_insert_authenticated ON error_logs;
CREATE POLICY error_logs_insert_authenticated ON error_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS error_logs_select_super_admin ON error_logs;
CREATE POLICY error_logs_select_super_admin ON error_logs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'
  ));

-- Cleanup: keep only 90 days of logs to bound table size.
-- (Run manually or wire a pg_cron job.)
CREATE OR REPLACE FUNCTION purge_old_error_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '90 days';
$$;

NOTIFY pgrst, 'reload schema';
