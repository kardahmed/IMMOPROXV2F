-- ================================================
-- Quota alert tracking (sent only once per tenant + service +
-- threshold + month). Without this de-dup table, the hourly cron
-- would re-send the same alert dozens of times.
-- ================================================

CREATE TABLE IF NOT EXISTS quota_alerts_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service TEXT NOT NULL CHECK (service IN ('anthropic', 'resend', 'whatsapp')),
  threshold_pct INTEGER NOT NULL CHECK (threshold_pct IN (90, 100)),
  period_yyyymm TEXT NOT NULL,
  used_at_send INTEGER NOT NULL,
  limit_at_send INTEGER NOT NULL,
  email_recipient TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service, threshold_pct, period_yyyymm)
);

CREATE INDEX IF NOT EXISTS idx_quota_alerts_sent_tenant ON quota_alerts_sent(tenant_id, period_yyyymm);
CREATE INDEX IF NOT EXISTS idx_quota_alerts_sent_at ON quota_alerts_sent(sent_at DESC);

ALTER TABLE quota_alerts_sent ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'super_admin_read_quota_alerts') THEN
    CREATE POLICY "super_admin_read_quota_alerts" ON quota_alerts_sent
      FOR SELECT
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_insert_quota_alerts') THEN
    CREATE POLICY "service_insert_quota_alerts" ON quota_alerts_sent
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- ------------------------------------------------
-- Cron: hourly scan
-- ------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('check-quota-alerts-hourly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-quota-alerts-hourly');
    PERFORM cron.schedule(
      'check-quota-alerts-hourly',
      '15 * * * *',
      $cron$ SELECT call_edge_function('check-quota-alerts'); $cron$
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
