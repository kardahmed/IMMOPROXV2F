-- 051_perf_views_atomic_rpcs.sql
-- ────────────────────────────────────────────────────────────────────
-- Audit follow-up sprint 4: performance + atomicity for the super
-- admin panel.
--
-- This migration:
--
--   1. tenant_counts_view — pre-aggregated counts of clients, units,
--      projects, sales, agents per tenant. TenantsPage was fetching
--      EVERY row of clients/units just to count them; on a busy
--      project that's hundreds of MB downloaded each render. The
--      view (security_invoker so RLS still applies) lets the panel
--      ask Postgres to do the counting once.
--
--   2. save_plan_features_atomic(p_changes JSONB) — wraps the loop
--      of UPDATEs that PlansConfigPage runs sequentially from the
--      browser. A partial failure mid-loop left the plan_limits
--      table in an inconsistent state. Now: single transaction,
--      all-or-nothing.
--
--   3. duplicate_tenant_config_atomic(...) — wraps the multi-table
--      copy that DuplicateConfigModal runs from the browser. Same
--      atomicity story: 6+ awaits become a single transaction.
--
-- All RPCs are SECURITY DEFINER and re-check the caller is super_admin
-- (we cannot rely on the client-side guard).
-- ────────────────────────────────────────────────────────────────────

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- 1. tenant_counts_view
-- ════════════════════════════════════════════════════════════════════
-- security_invoker = on so RLS on the underlying tables still applies.
-- A regular tenant user only sees their own row; super_admin sees
-- every row through the existing is_super_admin() bypass policies.

CREATE OR REPLACE VIEW tenant_counts_view
  WITH (security_invoker = on)
AS
SELECT
  t.id                                                           AS tenant_id,
  COALESCE((SELECT COUNT(*) FROM users u
              WHERE u.tenant_id = t.id
                AND u.role IN ('agent', 'admin')
                AND u.status = 'active'), 0)                      AS active_agents,
  COALESCE((SELECT COUNT(*) FROM users u
              WHERE u.tenant_id = t.id
                AND u.role IN ('agent', 'admin')), 0)             AS total_users,
  COALESCE((SELECT COUNT(*) FROM clients c
              WHERE c.tenant_id = t.id
                AND c.deleted_at IS NULL), 0)                     AS total_clients,
  COALESCE((SELECT COUNT(*) FROM projects p
              WHERE p.tenant_id = t.id
                AND p.status = 'active'), 0)                      AS active_projects,
  COALESCE((SELECT COUNT(*) FROM units u
              WHERE u.tenant_id = t.id), 0)                       AS total_units,
  COALESCE((SELECT COUNT(*) FROM units u
              WHERE u.tenant_id = t.id
                AND u.status = 'sold'), 0)                        AS sold_units,
  COALESCE((SELECT COUNT(*) FROM sales s
              WHERE s.tenant_id = t.id
                AND s.status = 'active'), 0)                      AS active_sales,
  COALESCE((SELECT SUM(s.final_price) FROM sales s
              WHERE s.tenant_id = t.id
                AND s.status = 'active'), 0)                      AS total_revenue,
  COALESCE((SELECT COUNT(*) FROM reservations r
              WHERE r.tenant_id = t.id
                AND r.status = 'active'), 0)                      AS active_reservations
FROM tenants t;

COMMENT ON VIEW tenant_counts_view IS
  'Pre-aggregated tenant counts for the super-admin panel. Replaces '
  'TenantsPage''s per-tenant N+1 fetch of every clients/units row '
  'just to compute a count. SECURITY INVOKER preserves RLS — a tenant '
  'user sees only their row, super_admin sees all.';

GRANT SELECT ON tenant_counts_view TO authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 2. save_plan_features_atomic
-- ════════════════════════════════════════════════════════════════════
-- p_changes is a JSONB object: { "free": { features: {...}, limits: {...} },
--                                 "starter": { features: {...}, limits: {...} },
--                                 ... }
-- Each plan key corresponds to a row in plan_limits. Updates run in
-- one transaction so a partial failure rolls back.

-- p_plans is a JSONB array of plan_limits rows. Each entry must
-- contain a `plan` key naming the row to update. Only the plain
-- numeric / JSONB columns are honored — keys we don't recognise are
-- ignored, so the RPC is forwards-compatible with future plan_limits
-- columns (the client just stops sending the old field).

CREATE OR REPLACE FUNCTION save_plan_features_atomic(p_plans JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_plan        JSONB;
  v_count       INT := 0;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super_admin can save plan features'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(p_plans) <> 'array' THEN
    RAISE EXCEPTION 'p_plans must be a JSONB array';
  END IF;

  FOR v_plan IN SELECT * FROM jsonb_array_elements(p_plans)
  LOOP
    IF (v_plan->>'plan') IS NULL THEN
      RAISE EXCEPTION 'Each plan entry must have a "plan" key';
    END IF;

    UPDATE plan_limits
       SET
         max_agents                    = COALESCE((v_plan->>'max_agents')::INT,                    max_agents),
         max_projects                  = COALESCE((v_plan->>'max_projects')::INT,                  max_projects),
         max_units                     = COALESCE((v_plan->>'max_units')::INT,                     max_units),
         max_clients                   = COALESCE((v_plan->>'max_clients')::INT,                   max_clients),
         max_storage_mb                = COALESCE((v_plan->>'max_storage_mb')::INT,                max_storage_mb),
         max_ai_tokens_monthly         = COALESCE((v_plan->>'max_ai_tokens_monthly')::INT,         max_ai_tokens_monthly),
         price_monthly                 = COALESCE((v_plan->>'price_monthly')::INT,                 price_monthly),
         price_yearly                  = COALESCE((v_plan->>'price_yearly')::INT,                  price_yearly),
         features                      = COALESCE(v_plan->'features',                              features),
         quota_ai_calls_monthly        = COALESCE((v_plan->>'quota_ai_calls_monthly')::INT,        quota_ai_calls_monthly),
         quota_emails_monthly          = COALESCE((v_plan->>'quota_emails_monthly')::INT,          quota_emails_monthly),
         quota_whatsapp_messages_monthly = COALESCE((v_plan->>'quota_whatsapp_messages_monthly')::INT, quota_whatsapp_messages_monthly),
         quota_burst_per_hour          = COALESCE((v_plan->>'quota_burst_per_hour')::INT,          quota_burst_per_hour),
         setup_fee_dzd                 = COALESCE((v_plan->>'setup_fee_dzd')::INT,                 setup_fee_dzd),
         updated_at                    = NOW()
     WHERE plan = v_plan->>'plan';

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION save_plan_features_atomic(JSONB) TO authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 3. duplicate_tenant_config_atomic
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION duplicate_tenant_config_atomic(
  p_source_tenant_id UUID,
  p_target_tenant_id UUID,
  p_copy_settings    BOOLEAN,
  p_copy_templates   BOOLEAN,
  p_copy_pipeline    BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role     TEXT;
  v_settings_count  INT := 0;
  v_templates_count INT := 0;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super_admin can duplicate tenant config'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_source_tenant_id = p_target_tenant_id THEN
    RAISE EXCEPTION 'Source and target tenants must differ'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 1. Settings (general + pipeline subset).
  IF p_copy_settings OR p_copy_pipeline THEN
    INSERT INTO tenant_settings (
      tenant_id,
      reservation_duration_days,
      min_deposit_amount,
      notif_agent_inactive,
      notif_payment_late,
      notif_reservation_expired,
      notif_new_client,
      notif_new_sale,
      notif_goal_achieved,
      urgent_alert_days,
      relaunch_alert_days
    )
    SELECT
      p_target_tenant_id,
      CASE WHEN p_copy_settings THEN s.reservation_duration_days ELSE NULL END,
      CASE WHEN p_copy_settings THEN s.min_deposit_amount        ELSE NULL END,
      CASE WHEN p_copy_settings THEN s.notif_agent_inactive      ELSE NULL END,
      CASE WHEN p_copy_settings THEN s.notif_payment_late        ELSE NULL END,
      CASE WHEN p_copy_settings THEN s.notif_reservation_expired ELSE NULL END,
      CASE WHEN p_copy_settings THEN s.notif_new_client          ELSE NULL END,
      CASE WHEN p_copy_settings THEN s.notif_new_sale            ELSE NULL END,
      CASE WHEN p_copy_settings THEN s.notif_goal_achieved       ELSE NULL END,
      CASE WHEN p_copy_pipeline THEN s.urgent_alert_days         ELSE NULL END,
      CASE WHEN p_copy_pipeline THEN s.relaunch_alert_days       ELSE NULL END
    FROM tenant_settings s
    WHERE s.tenant_id = p_source_tenant_id
    ON CONFLICT (tenant_id) DO UPDATE
    SET
      reservation_duration_days = COALESCE(EXCLUDED.reservation_duration_days, tenant_settings.reservation_duration_days),
      min_deposit_amount        = COALESCE(EXCLUDED.min_deposit_amount,        tenant_settings.min_deposit_amount),
      notif_agent_inactive      = COALESCE(EXCLUDED.notif_agent_inactive,      tenant_settings.notif_agent_inactive),
      notif_payment_late        = COALESCE(EXCLUDED.notif_payment_late,        tenant_settings.notif_payment_late),
      notif_reservation_expired = COALESCE(EXCLUDED.notif_reservation_expired, tenant_settings.notif_reservation_expired),
      notif_new_client          = COALESCE(EXCLUDED.notif_new_client,          tenant_settings.notif_new_client),
      notif_new_sale            = COALESCE(EXCLUDED.notif_new_sale,            tenant_settings.notif_new_sale),
      notif_goal_achieved       = COALESCE(EXCLUDED.notif_goal_achieved,       tenant_settings.notif_goal_achieved),
      urgent_alert_days         = COALESCE(EXCLUDED.urgent_alert_days,         tenant_settings.urgent_alert_days),
      relaunch_alert_days       = COALESCE(EXCLUDED.relaunch_alert_days,       tenant_settings.relaunch_alert_days);

    v_settings_count := 1;
  END IF;

  -- 2. Document templates (UPSERT per type).
  IF p_copy_templates THEN
    WITH src AS (
      SELECT type, content FROM document_templates WHERE tenant_id = p_source_tenant_id
    ),
    upserted AS (
      INSERT INTO document_templates (tenant_id, type, content)
      SELECT p_target_tenant_id, type, content FROM src
      ON CONFLICT (tenant_id, type) DO UPDATE SET content = EXCLUDED.content
      RETURNING id
    )
    SELECT COUNT(*) INTO v_templates_count FROM upserted;
  END IF;

  -- 3. Audit row.
  INSERT INTO super_admin_logs (super_admin_id, action, tenant_id, details)
  VALUES (
    auth.uid(),
    'duplicate_config',
    p_target_tenant_id,
    jsonb_build_object(
      'source_tenant_id', p_source_tenant_id,
      'copied', jsonb_build_object(
        'settings', p_copy_settings,
        'templates', p_copy_templates,
        'pipeline', p_copy_pipeline
      ),
      'templates_count', v_templates_count
    )
  );

  RETURN jsonb_build_object(
    'settings_count',  v_settings_count,
    'templates_count', v_templates_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION duplicate_tenant_config_atomic(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

COMMIT;
