-- 042_fix_whatsapp_accounts_super_admin.sql
-- Fix: super admin couldn't activate WhatsApp for any tenant from /admin/whatsapp
-- because the RLS policies on whatsapp_accounts required tenant_id to match
-- get_my_tenant_id() (the super admin's own tenant_id, which doesn't match
-- the target tenant being activated).
--
-- After this migration:
--   - Super admin can SELECT / INSERT / UPDATE whatsapp_accounts for ANY tenant
--   - Tenant admin can still only manage their own tenant's whatsapp_accounts
--   - DELETE remains super-admin-only (was already correct)

DROP POLICY IF EXISTS "whatsapp_accounts_select" ON whatsapp_accounts;
CREATE POLICY "whatsapp_accounts_select" ON whatsapp_accounts FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "whatsapp_accounts_insert" ON whatsapp_accounts;
CREATE POLICY "whatsapp_accounts_insert" ON whatsapp_accounts FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "whatsapp_accounts_update" ON whatsapp_accounts;
CREATE POLICY "whatsapp_accounts_update" ON whatsapp_accounts FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );
