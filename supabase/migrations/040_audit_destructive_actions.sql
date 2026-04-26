-- ================================================
-- Audit extensions — surface destructive / financial actions in
-- super_admin_logs so they show up on /admin/logs.
--
-- Replaces the soft_delete_tenant and restore_tenant RPCs from
-- migrations 037 and 038 with versions that emit a log row, and
-- adds a TRIGGER on plan_limits for any price/quota tweak made
-- from the cockpit (PR #58).
-- ================================================

-- 1. soft_delete_tenant: now logs `delete_tenant`
CREATE OR REPLACE FUNCTION soft_delete_tenant(
  p_tenant_id UUID,
  p_confirmation_name TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_tenant_name TEXT;
  v_already_deleted TIMESTAMPTZ;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  SELECT name, deleted_at INTO v_tenant_name, v_already_deleted
    FROM tenants WHERE id = p_tenant_id;

  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_already_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant already deleted at %', v_already_deleted USING ERRCODE = 'check_violation';
  END IF;

  IF p_confirmation_name <> v_tenant_name THEN
    RAISE EXCEPTION 'Confirmation name mismatch (expected %, got %)', v_tenant_name, p_confirmation_name
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE tenants
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         deletion_reason = p_reason,
         suspended_at = COALESCE(suspended_at, now())
   WHERE id = p_tenant_id;

  INSERT INTO super_admin_logs (super_admin_id, action, tenant_id, details)
  VALUES (
    auth.uid(),
    'delete_tenant',
    p_tenant_id,
    jsonb_build_object('tenant_name', v_tenant_name, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant_name,
    'deleted_at', now(),
    'deleted_by', auth.uid()
  );
END;
$$;

-- 2. restore_tenant: now logs `restore_tenant`
CREATE OR REPLACE FUNCTION restore_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_tenant_name TEXT;
  v_already_active BOOLEAN;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  SELECT name, deleted_at IS NULL INTO v_tenant_name, v_already_active
    FROM tenants WHERE id = p_tenant_id;

  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_already_active THEN
    RAISE EXCEPTION 'Tenant is already active' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE tenants
     SET deleted_at = NULL,
         deleted_by = NULL,
         deletion_reason = NULL,
         suspended_at = NULL
   WHERE id = p_tenant_id;

  INSERT INTO super_admin_logs (super_admin_id, action, tenant_id, details)
  VALUES (
    auth.uid(),
    'restore_tenant',
    p_tenant_id,
    jsonb_build_object('tenant_name', v_tenant_name)
  );

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant_name,
    'restored_at', now(),
    'restored_by', auth.uid()
  );
END;
$$;

-- 3. Trigger on plan_limits — log any price / quota / feature change
CREATE OR REPLACE FUNCTION log_plan_limits_change() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_changes JSONB := '{}'::jsonb;
BEGIN
  IF v_caller IS NULL THEN
    -- Skip when called from migrations / service_role — there's no caller.
    RETURN NEW;
  END IF;

  IF NEW.price_monthly IS DISTINCT FROM OLD.price_monthly THEN
    v_changes := v_changes || jsonb_build_object('price_monthly', jsonb_build_array(OLD.price_monthly, NEW.price_monthly));
  END IF;
  IF NEW.quota_ai_calls_monthly IS DISTINCT FROM OLD.quota_ai_calls_monthly THEN
    v_changes := v_changes || jsonb_build_object('quota_ai_calls_monthly', jsonb_build_array(OLD.quota_ai_calls_monthly, NEW.quota_ai_calls_monthly));
  END IF;
  IF NEW.quota_emails_monthly IS DISTINCT FROM OLD.quota_emails_monthly THEN
    v_changes := v_changes || jsonb_build_object('quota_emails_monthly', jsonb_build_array(OLD.quota_emails_monthly, NEW.quota_emails_monthly));
  END IF;
  IF NEW.quota_whatsapp_messages_monthly IS DISTINCT FROM OLD.quota_whatsapp_messages_monthly THEN
    v_changes := v_changes || jsonb_build_object('quota_whatsapp_messages_monthly', jsonb_build_array(OLD.quota_whatsapp_messages_monthly, NEW.quota_whatsapp_messages_monthly));
  END IF;
  IF NEW.features::text IS DISTINCT FROM OLD.features::text THEN
    v_changes := v_changes || jsonb_build_object('features_changed', true);
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO super_admin_logs (super_admin_id, action, tenant_id, details)
    VALUES (
      v_caller,
      'update_plan',
      NULL,
      jsonb_build_object('plan', NEW.plan, 'changes', v_changes)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_limits_audit ON plan_limits;
CREATE TRIGGER trg_plan_limits_audit
  AFTER UPDATE ON plan_limits
  FOR EACH ROW
  EXECUTE FUNCTION log_plan_limits_change();

NOTIFY pgrst, 'reload schema';
