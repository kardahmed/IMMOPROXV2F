-- ============================================================================
-- 058_create_tenant_atomic.sql
--
-- P1 fix from the tenant-creation audit. The previous flow ran 3
-- separate INSERTs from the create-tenant-user edge function:
--   1. INSERT INTO tenants
--   2. INSERT INTO tenant_settings
--   3. INSERT INTO document_templates × 3
-- Plus an inviteUserByEmail then an INSERT INTO users. If any step
-- past #1 failed, the tenant existed in a half-built state.
--
-- This RPC wraps steps 1-3 in a single transaction. If the templates
-- insert dies (eg. CHECK violation, RLS edge case), the whole thing
-- rolls back atomically. The caller still does the auth invite + user
-- profile insert in JS — those have to stay outside Postgres because
-- they hit the Supabase Auth admin API.
--
-- Also adds:
--   - plan + trial_days as inputs (was always defaulting to 'free')
--   - plan_expires_at = now() + trial_days, so trials expire on time
--
-- Auth: SECURITY DEFINER with super_admin check inside, so we don't
-- have to grant raw INSERT on tenants/settings/templates to authed.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_tenant_atomic(
  p_name        TEXT,
  p_email       TEXT,
  p_phone       TEXT DEFAULT NULL,
  p_address     TEXT DEFAULT NULL,
  p_wilaya      TEXT DEFAULT NULL,
  p_website     TEXT DEFAULT NULL,
  p_plan        TEXT DEFAULT 'starter',
  p_trial_days  INT  DEFAULT 14
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_expires   TIMESTAMPTZ;
BEGIN
  -- Caller must be super_admin. We can't trust the edge function to
  -- have done the check, so re-verify here.
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only' USING ERRCODE = '42501';
  END IF;

  -- Normalise + validate plan
  IF p_plan NOT IN ('free', 'starter', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'Invalid plan: %', p_plan USING ERRCODE = '22023';
  END IF;

  -- Trial expiry. p_trial_days = 0 means no trial (NULL expires_at,
  -- which the rest of the app treats as "no automatic downgrade").
  v_expires := CASE
    WHEN p_trial_days > 0 THEN NOW() + (p_trial_days || ' days')::INTERVAL
    ELSE NULL
  END;

  -- 1. Tenant row
  INSERT INTO tenants (name, email, phone, address, wilaya, website, plan, plan_expires_at)
  VALUES (p_name, p_email, p_phone, p_address, p_wilaya, p_website, p_plan, v_expires)
  RETURNING id INTO v_tenant_id;

  -- 2. Default settings
  INSERT INTO tenant_settings (tenant_id, urgent_alert_days, relaunch_alert_days, reservation_duration_days, min_deposit_amount)
  VALUES (v_tenant_id, 7, 3, 30, 0);

  -- 3. Default document templates (3 types). We don't seed content
  -- here so the admin can craft their own without first deleting the
  -- placeholder.
  INSERT INTO document_templates (tenant_id, type, content)
  VALUES
    (v_tenant_id, 'contrat_vente', ''),
    (v_tenant_id, 'echeancier', ''),
    (v_tenant_id, 'bon_reservation', '');

  RETURN v_tenant_id;
END;
$$;

-- Hard-delete helper: used by the edge function to undo the tenant
-- if the auth invite or the public.users insert fails after the RPC
-- already ran. CASCADE on FK columns wipes settings + templates.
CREATE OR REPLACE FUNCTION delete_tenant_atomic(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only' USING ERRCODE = '42501';
  END IF;

  -- Defensive: explicit deletes for tables that may not have ON DELETE CASCADE
  -- set against tenants.id. Order matters when CASCADE is missing.
  DELETE FROM document_templates WHERE tenant_id = p_tenant_id;
  DELETE FROM tenant_settings    WHERE tenant_id = p_tenant_id;
  DELETE FROM tenants            WHERE id = p_tenant_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
