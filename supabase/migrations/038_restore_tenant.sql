-- ================================================
-- Restore tenant — counterpart to soft_delete_tenant (migration 037)
--
-- Lighter ceremony than deletion: no name typing, just a super_admin
-- check. Setting deleted_at = NULL also clears the audit trail
-- bookkeeping (deleted_by + deletion_reason) so the row looks fresh
-- to downstream code.
-- ================================================

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

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant_name,
    'restored_at', now(),
    'restored_by', auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION restore_tenant(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
