-- ================================================
-- Step K — API costs tracking + profit dashboard
--   Single table api_costs gets one row per external
--   API call (Anthropic, Resend, Meta WhatsApp). All
--   costs are stored in DZD (Algerian Dinar) to match
--   the platform's revenue currency (plan_limits.price_monthly).
--
--   The aggregated dashboard data is exposed via the
--   get_costs_summary(start, end) RPC, which the super
--   admin /admin/costs page calls.
-- ================================================

CREATE TABLE IF NOT EXISTS api_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  service TEXT NOT NULL CHECK (service IN ('anthropic', 'resend', 'whatsapp', 'supabase')),
  operation TEXT,
  units NUMERIC NOT NULL DEFAULT 0,
  cost_da NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_costs_tenant_created ON api_costs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_costs_service_created ON api_costs(service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_costs_created ON api_costs(created_at DESC);

ALTER TABLE api_costs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'super_admin_read_api_costs') THEN
    CREATE POLICY "super_admin_read_api_costs" ON api_costs
      FOR SELECT
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_insert_api_costs') THEN
    CREATE POLICY "service_insert_api_costs" ON api_costs
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- ------------------------------------------------
-- RPC: get_costs_summary
--   Returns a single JSONB blob with everything
--   needed for the dashboard. Default window =
--   last 30 days.
-- ------------------------------------------------
CREATE OR REPLACE FUNCTION get_costs_summary(
  p_start_date TIMESTAMPTZ DEFAULT (now() - INTERVAL '30 days'),
  p_end_date TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue_da NUMERIC;
  v_costs_by_service JSONB;
  v_total_costs_da NUMERIC;
  v_top_tenants JSONB;
  v_daily JSONB;
  -- Supabase Pro plan ~ $25 USD/month, ~3500 DA at 140 DA/USD.
  -- This is a fixed platform cost — pro-rated to the window.
  v_supabase_monthly_da NUMERIC := 3500;
  v_window_days NUMERIC;
  v_supabase_window_da NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  v_window_days := GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400.0);
  v_supabase_window_da := ROUND(v_supabase_monthly_da * v_window_days / 30.0);

  -- Revenue = sum of active tenant plan prices (monthly)
  SELECT COALESCE(SUM(pl.price_monthly), 0)
    INTO v_revenue_da
    FROM tenants t
    JOIN plan_limits pl ON pl.plan = t.plan
   WHERE COALESCE(t.suspended_at, NULL) IS NULL
     AND (t.plan_expires_at IS NULL OR t.plan_expires_at > now());

  -- Variable costs by service
  SELECT COALESCE(jsonb_object_agg(service, total), '{}'::jsonb)
    INTO v_costs_by_service
    FROM (
      SELECT service, ROUND(SUM(cost_da))::numeric AS total
        FROM api_costs
       WHERE created_at BETWEEN p_start_date AND p_end_date
       GROUP BY service
    ) s;

  -- Add fixed Supabase cost
  v_costs_by_service := v_costs_by_service
    || jsonb_build_object('supabase', v_supabase_window_da);

  -- Total costs across all services (variable + fixed)
  SELECT COALESCE(SUM((value)::numeric), 0)
    INTO v_total_costs_da
    FROM jsonb_each_text(v_costs_by_service);

  -- Top 5 tenants by variable cost in window
  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
    INTO v_top_tenants
    FROM (
      SELECT
          t.id AS tenant_id,
          t.name AS tenant_name,
          t.plan AS plan,
          ROUND(COALESCE(SUM(c.cost_da), 0))::numeric AS cost_da,
          COALESCE(pl.price_monthly, 0) AS revenue_da,
          COALESCE(pl.price_monthly, 0) - ROUND(COALESCE(SUM(c.cost_da), 0))::numeric AS profit_da
        FROM tenants t
        LEFT JOIN api_costs c
          ON c.tenant_id = t.id
         AND c.created_at BETWEEN p_start_date AND p_end_date
        LEFT JOIN plan_limits pl ON pl.plan = t.plan
       WHERE t.suspended_at IS NULL
       GROUP BY t.id, t.name, t.plan, pl.price_monthly
       ORDER BY SUM(c.cost_da) DESC NULLS LAST
       LIMIT 5
    ) x;

  -- Daily totals across the window (for the chart)
  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.day), '[]'::jsonb)
    INTO v_daily
    FROM (
      SELECT
          DATE(c.created_at) AS day,
          ROUND(SUM(c.cost_da))::numeric AS cost_da
        FROM api_costs c
       WHERE c.created_at BETWEEN p_start_date AND p_end_date
       GROUP BY DATE(c.created_at)
    ) d;

  RETURN jsonb_build_object(
    'period_start', p_start_date,
    'period_end', p_end_date,
    'window_days', ROUND(v_window_days, 1),
    'revenue_da', v_revenue_da,
    'costs_by_service', v_costs_by_service,
    'total_costs_da', v_total_costs_da,
    'profit_da', v_revenue_da - v_total_costs_da,
    'margin_pct', CASE
      WHEN v_revenue_da > 0 THEN ROUND((v_revenue_da - v_total_costs_da) / v_revenue_da * 100, 1)
      ELSE 0
    END,
    'top_tenants', v_top_tenants,
    'daily', v_daily
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_costs_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
