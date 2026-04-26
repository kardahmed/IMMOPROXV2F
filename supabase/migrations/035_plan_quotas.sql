-- ================================================
-- Plan quotas (Step Q-A)
--   Adds usage-based quotas on top of the existing
--   structural limits (max_agents, max_units, ...).
--   Edge Functions check these BEFORE every external
--   API call (Anthropic, Resend, Meta WhatsApp) and
--   return 429 if the tenant is over its monthly cap
--   or its hourly burst cap.
--
--   Convention: -1 = unlimited (used for enterprise).
-- ================================================

ALTER TABLE plan_limits
  ADD COLUMN IF NOT EXISTS quota_ai_calls_monthly INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_emails_monthly INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_whatsapp_messages_monthly INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_burst_per_hour INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS setup_fee_dzd INTEGER NOT NULL DEFAULT 0;

-- Seed sensible defaults for the four built-in plans.
-- These are tunable later via /admin/plans (PR B).
UPDATE plan_limits
   SET quota_ai_calls_monthly = 0,
       quota_emails_monthly = 50,
       quota_whatsapp_messages_monthly = 30,
       quota_burst_per_hour = 20,
       setup_fee_dzd = 0
 WHERE plan = 'free';

UPDATE plan_limits
   SET quota_ai_calls_monthly = 0,
       quota_emails_monthly = 500,
       quota_whatsapp_messages_monthly = 300,
       quota_burst_per_hour = 100,
       setup_fee_dzd = 0
 WHERE plan = 'starter';

UPDATE plan_limits
   SET quota_ai_calls_monthly = 200,
       quota_emails_monthly = 5000,
       quota_whatsapp_messages_monthly = 3000,
       quota_burst_per_hour = 300,
       setup_fee_dzd = 50000
 WHERE plan = 'pro';

-- Enterprise = unlimited everywhere; setup fee negotiated case by case.
UPDATE plan_limits
   SET quota_ai_calls_monthly = -1,
       quota_emails_monthly = -1,
       quota_whatsapp_messages_monthly = -1,
       quota_burst_per_hour = -1,
       setup_fee_dzd = 0
 WHERE plan = 'enterprise';

-- Helper view for reading current month usage per tenant + service.
-- Edge Functions and the dashboard both query this.
CREATE OR REPLACE VIEW tenant_usage_current_month AS
SELECT
  c.tenant_id,
  c.service,
  COUNT(*)::INTEGER AS used,
  SUM(c.cost_da)::NUMERIC AS cost_da,
  date_trunc('month', now()) AS period_start,
  (date_trunc('month', now()) + INTERVAL '1 month') AS period_end
  FROM api_costs c
 WHERE c.created_at >= date_trunc('month', now())
 GROUP BY c.tenant_id, c.service;

-- View security mirrors api_costs (super_admin read only). Tenants
-- read their own usage via the check_quota_self RPC below — they
-- never see another tenant's row.
GRANT SELECT ON tenant_usage_current_month TO authenticated;

-- ------------------------------------------------
-- RPC: check_quota_self
--   Returns the caller's own quota status across all
--   3 tracked services. Used by the tenant /settings
--   page to render progress bars. No service param —
--   always returns the full picture in one call.
-- ------------------------------------------------
CREATE OR REPLACE FUNCTION check_quota_self()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_plan TEXT;
  v_limits RECORD;
  v_anthropic INTEGER;
  v_resend INTEGER;
  v_whatsapp INTEGER;
  v_burst INTEGER;
  v_period_end TIMESTAMPTZ;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant for current user';
  END IF;

  SELECT t.plan INTO v_plan FROM tenants t WHERE t.id = v_tenant_id;

  SELECT quota_ai_calls_monthly,
         quota_emails_monthly,
         quota_whatsapp_messages_monthly,
         quota_burst_per_hour
    INTO v_limits
    FROM plan_limits
   WHERE plan = v_plan;

  -- Used this month per service
  SELECT COUNT(*) FILTER (WHERE service = 'anthropic'),
         COUNT(*) FILTER (WHERE service = 'resend'),
         COUNT(*) FILTER (WHERE service = 'whatsapp')
    INTO v_anthropic, v_resend, v_whatsapp
    FROM api_costs
   WHERE tenant_id = v_tenant_id
     AND created_at >= date_trunc('month', now());

  -- Used in last hour (all services combined, for burst)
  SELECT COUNT(*) INTO v_burst
    FROM api_costs
   WHERE tenant_id = v_tenant_id
     AND created_at >= now() - INTERVAL '1 hour';

  v_period_end := date_trunc('month', now()) + INTERVAL '1 month';

  RETURN jsonb_build_object(
    'plan', v_plan,
    'period_end', v_period_end,
    'anthropic', jsonb_build_object('used', COALESCE(v_anthropic, 0), 'limit', v_limits.quota_ai_calls_monthly),
    'resend',    jsonb_build_object('used', COALESCE(v_resend,    0), 'limit', v_limits.quota_emails_monthly),
    'whatsapp',  jsonb_build_object('used', COALESCE(v_whatsapp,  0), 'limit', v_limits.quota_whatsapp_messages_monthly),
    'burst',     jsonb_build_object('used', COALESCE(v_burst,     0), 'limit', v_limits.quota_burst_per_hour, 'window_minutes', 60)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_quota_self() TO authenticated;
