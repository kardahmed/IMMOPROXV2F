-- ================================================
-- Phase 6 — Instant propagation of plan changes
--
-- Final piece of the plan refactor. Once a tenant is provisioned on
-- a plan, any change to that plan (by the super admin at /admin/plans)
-- OR any plan switch (upgrade / downgrade of the tenant itself) must
-- propagate to dependent tables without manual intervention.
--
-- JSONB features propagate naturally through the app because the
-- frontend reads plan_limits.features live on every page (via the
-- usePlanEnforcement hook). The only physical data that needs
-- copying is:
--
--   whatsapp_accounts.monthly_quota — the per-tenant quota that
--   the send-whatsapp Edge Function checks before every message
--
-- That column has to mirror plan_limits.max_whatsapp_messages for
-- the tenant's current plan. Without a trigger, a tenant whose
-- plan was just upgraded from "pro" to "enterprise" would keep the
-- old 2000-message limit until someone ran a backfill.
--
-- Two triggers handle both propagation directions:
--
--   1. tenants.plan changes     → update that tenant's quota
--   2. plan_limits quota changes → update every tenant on that plan
--
-- A third helper — sync_whatsapp_quota_from_plan(tenant_id) — is
-- exposed as a SECURITY DEFINER function so Edge Functions or
-- admin UIs can call it explicitly if needed (e.g. after a manual
-- plan migration script).
--
-- Every statement is idempotent (DROP … IF EXISTS + CREATE OR REPLACE).
-- ================================================

-- ----------------------------------------
-- 1. Helper function — sync ONE tenant's WhatsApp quota from its plan
-- ----------------------------------------
CREATE OR REPLACE FUNCTION sync_whatsapp_quota_from_plan(p_tenant_id UUID)
RETURNS VOID AS $$
DECLARE
  v_plan  TEXT;
  v_quota INTEGER;
BEGIN
  SELECT plan INTO v_plan FROM tenants WHERE id = p_tenant_id;
  IF v_plan IS NULL THEN RETURN; END IF;

  SELECT max_whatsapp_messages INTO v_quota
  FROM plan_limits
  WHERE plan = v_plan;

  IF v_quota IS NULL THEN RETURN; END IF;

  -- -1 means unlimited; store as 999999 so numeric comparisons
  -- (messages_sent < monthly_quota) still pass during sends.
  IF v_quota = -1 THEN
    v_quota := 999999;
  END IF;

  UPDATE whatsapp_accounts
  SET monthly_quota = v_quota
  WHERE tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sync_whatsapp_quota_from_plan(UUID) IS
  'Re-computes the WhatsApp monthly_quota for one tenant based on their current plan. Called automatically by triggers; can also be invoked manually after data migrations.';

-- ----------------------------------------
-- 2. Trigger on tenants — plan change propagates to that tenant's quota
-- ----------------------------------------
CREATE OR REPLACE FUNCTION trg_tenants_plan_change_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    PERFORM sync_whatsapp_quota_from_plan(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_plan_change_sync ON tenants;
CREATE TRIGGER tenants_plan_change_sync
  AFTER UPDATE OF plan ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION trg_tenants_plan_change_sync();

-- ----------------------------------------
-- 3. Trigger on plan_limits — quota change propagates to every tenant on that plan
-- ----------------------------------------
CREATE OR REPLACE FUNCTION trg_plan_limits_quota_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.max_whatsapp_messages IS DISTINCT FROM OLD.max_whatsapp_messages THEN
    UPDATE whatsapp_accounts wa
    SET monthly_quota = CASE
      WHEN NEW.max_whatsapp_messages = -1 THEN 999999
      ELSE NEW.max_whatsapp_messages
    END
    FROM tenants t
    WHERE wa.tenant_id = t.id
      AND t.plan = NEW.plan;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_limits_quota_sync ON plan_limits;
CREATE TRIGGER plan_limits_quota_sync
  AFTER UPDATE OF max_whatsapp_messages ON plan_limits
  FOR EACH ROW
  EXECUTE FUNCTION trg_plan_limits_quota_sync();
