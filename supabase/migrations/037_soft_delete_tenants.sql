-- ================================================
-- Soft-delete tenants with name-typing confirmation
--
-- Pattern inspired by GitHub repo deletion: the caller must type
-- the exact tenant name to enable the action. The RPC re-validates
-- the name server-side so the UI alone can't be bypassed.
--
-- Hard delete is intentionally NOT implemented — soft delete keeps
-- the data for legal / accounting / recovery reasons. To purge a
-- soft-deleted tenant, run a manual SQL with proper backups.
-- ================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON tenants(deleted_at) WHERE deleted_at IS NULL;

-- ------------------------------------------------
-- RPC: soft_delete_tenant
--   Marks a tenant as deleted (soft) only if the caller is super_admin
--   AND types the exact tenant name. Cascades a suspended_at too so
--   any code that already filters on suspended_at stops surfacing it.
-- ------------------------------------------------
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

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant_name,
    'deleted_at', now(),
    'deleted_by', auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION soft_delete_tenant(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
