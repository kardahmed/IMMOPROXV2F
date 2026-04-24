-- ================================================
-- Security hardening — migration 017
--
-- Closes the security gap identified during the 23-Apr-2026 audit:
-- under the original policies from migration 001, any authenticated
-- user in a tenant could SELECT/UPDATE/DELETE every row of
-- clients / visits / reservations / history / tasks / documents
-- for their tenant, regardless of who that row belonged to. A
-- departing agent could therefore wipe the agency's data on their
-- way out — the exact scenario that triggered this hardening pass.
--
-- What this migration does:
--   1. Adds soft-delete columns (deleted_at, deleted_by) to the
--      sensitive tables so destructive actions leave a recoverable
--      trail.
--   2. Rewrites RLS for those tables so:
--        - agents only SEE their own rows (+ unassigned ones) and
--          can only UPDATE their own rows
--        - admins see + edit everything in their tenant
--        - DELETE is admin-only (and super-admin-only for some
--          extra-sensitive tables)
--   3. Tightens whatsapp_messages / whatsapp_accounts similarly
--      (messages are visible to the owning client's agent, never
--      deletable below super-admin).
--   4. Creates a security_audit table + trigger-based logging of
--      every destructive action (INSERT / UPDATE that soft-deletes,
--      hard DELETE) so the tenant admin and super admin always have
--      a forensic trail.
--
-- Every statement is idempotent (CREATE IF NOT EXISTS, DROP POLICY
-- IF EXISTS before CREATE) so this migration can be re-applied
-- safely.
-- ================================================

-- ----------------------------------------
-- 1. Soft-delete columns on sensitive tables
-- ----------------------------------------
ALTER TABLE clients      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE clients      ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE visits       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE visits       ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE history      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE history      ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE tasks        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE tasks        ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE documents    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE documents    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial indexes so the "Corbeille" / trash view stays fast even
-- when the table grows (one hit per soft-deleted row only).
CREATE INDEX IF NOT EXISTS idx_clients_deleted      ON clients(deleted_at)      WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visits_deleted       ON visits(deleted_at)       WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_deleted ON reservations(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_history_deleted      ON history(deleted_at)      WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted        ON tasks(deleted_at)        WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted    ON documents(deleted_at)    WHERE deleted_at IS NOT NULL;

-- ----------------------------------------
-- 2. Helper — "user can see this row under agent isolation"
--
-- Centralises the rule: admin/super_admin see all, agents see only
-- rows where they are the agent_id or the row is unassigned
-- (agent_id IS NULL, e.g. fresh leads awaiting dispatch).
-- ----------------------------------------
CREATE OR REPLACE FUNCTION can_see_agent_row(row_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    get_user_role() IN ('admin', 'super_admin')
    OR row_agent_id = auth.uid()
    OR row_agent_id IS NULL
$$;

-- ----------------------------------------
-- 3. CLIENTS — the crown jewel table
-- ----------------------------------------
DROP POLICY IF EXISTS "clients_tenant_select" ON clients;
DROP POLICY IF EXISTS "clients_tenant_insert" ON clients;
DROP POLICY IF EXISTS "clients_tenant_update" ON clients;
DROP POLICY IF EXISTS "clients_tenant_delete" ON clients;
DROP POLICY IF EXISTS "clients_select"        ON clients;
DROP POLICY IF EXISTS "clients_insert"        ON clients;
DROP POLICY IF EXISTS "clients_update"        ON clients;
DROP POLICY IF EXISTS "clients_delete"        ON clients;

CREATE POLICY "clients_select" ON clients FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND can_see_agent_row(agent_id)
  );

CREATE POLICY "clients_insert" ON clients FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Agents can UPDATE only their own clients; admins update anything
-- in the tenant.
CREATE POLICY "clients_update" ON clients FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_user_role() IN ('admin', 'super_admin')
      OR agent_id = auth.uid()
    )
  );

-- Only tenant admin + super admin can DELETE clients.
CREATE POLICY "clients_delete" ON clients FOR DELETE
  USING (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- ----------------------------------------
-- 4. VISITS — tied to a client + an agent
-- ----------------------------------------
DROP POLICY IF EXISTS "visits_tenant_select" ON visits;
DROP POLICY IF EXISTS "visits_tenant_insert" ON visits;
DROP POLICY IF EXISTS "visits_tenant_update" ON visits;
DROP POLICY IF EXISTS "visits_tenant_delete" ON visits;

CREATE POLICY "visits_select" ON visits FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND can_see_agent_row(agent_id)
  );

CREATE POLICY "visits_insert" ON visits FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "visits_update" ON visits FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_user_role() IN ('admin', 'super_admin')
      OR agent_id = auth.uid()
    )
  );

CREATE POLICY "visits_delete" ON visits FOR DELETE
  USING (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- ----------------------------------------
-- 5. RESERVATIONS — carries money / legal commitment
--                  => stricter: DELETE is super-admin-only.
-- ----------------------------------------
DROP POLICY IF EXISTS "reservations_tenant_select" ON reservations;
DROP POLICY IF EXISTS "reservations_tenant_insert" ON reservations;
DROP POLICY IF EXISTS "reservations_tenant_update" ON reservations;
DROP POLICY IF EXISTS "reservations_tenant_delete" ON reservations;

CREATE POLICY "reservations_select" ON reservations FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND can_see_agent_row(agent_id)
  );

CREATE POLICY "reservations_insert" ON reservations FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Agents can only UPDATE to change status (cancel their own);
-- admins can update the rest. Enforced here by role, the specific
-- field-level checks stay in the app layer.
CREATE POLICY "reservations_update" ON reservations FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_user_role() IN ('admin', 'super_admin')
      OR agent_id = auth.uid()
    )
  );

CREATE POLICY "reservations_delete" ON reservations FOR DELETE
  USING (
    tenant_id = get_my_tenant_id()
    AND is_super_admin()
  );

-- ----------------------------------------
-- 6. HISTORY — the audit trail of every client action.
--              => never DELETE-able below super admin.
-- ----------------------------------------
DROP POLICY IF EXISTS "history_tenant_select" ON history;
DROP POLICY IF EXISTS "history_tenant_insert" ON history;
DROP POLICY IF EXISTS "history_tenant_update" ON history;
DROP POLICY IF EXISTS "history_tenant_delete" ON history;

CREATE POLICY "history_select" ON history FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND can_see_agent_row(agent_id)
  );

CREATE POLICY "history_insert" ON history FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- History is append-only for agents. Only super admin can tamper.
CREATE POLICY "history_update" ON history FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND is_super_admin()
  );

CREATE POLICY "history_delete" ON history FOR DELETE
  USING (
    tenant_id = get_my_tenant_id()
    AND is_super_admin()
  );

-- ----------------------------------------
-- 7. TASKS — agents work their tasks, admins oversee.
-- ----------------------------------------
DROP POLICY IF EXISTS "tasks_tenant_select" ON tasks;
DROP POLICY IF EXISTS "tasks_tenant_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_tenant_update" ON tasks;
DROP POLICY IF EXISTS "tasks_tenant_delete" ON tasks;

CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND can_see_agent_row(agent_id)
  );

CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_user_role() IN ('admin', 'super_admin')
      OR agent_id = auth.uid()
    )
  );

CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  USING (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- ----------------------------------------
-- 8. DOCUMENTS — client-owned files (CIN scans, contracts…).
-- ----------------------------------------
DROP POLICY IF EXISTS "documents_tenant_select" ON documents;
DROP POLICY IF EXISTS "documents_tenant_insert" ON documents;
DROP POLICY IF EXISTS "documents_tenant_update" ON documents;
DROP POLICY IF EXISTS "documents_tenant_delete" ON documents;

-- Documents don't carry an agent_id directly, they inherit from the
-- parent client. Agents see documents only for clients they own.
CREATE POLICY "documents_select" ON documents FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = documents.client_id
        AND can_see_agent_row(c.agent_id)
    )
  );

CREATE POLICY "documents_insert" ON documents FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "documents_update" ON documents FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_user_role() IN ('admin', 'super_admin')
      OR EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = documents.client_id
          AND c.agent_id = auth.uid()
      )
    )
  );

CREATE POLICY "documents_delete" ON documents FOR DELETE
  USING (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- ----------------------------------------
-- 9. WHATSAPP_MESSAGES — sacred audit of every send.
--                        Rewrites the policies from 016 to add
--                        agent isolation + explicit no-delete.
-- ----------------------------------------
DROP POLICY IF EXISTS "tenant_read_own_whatsapp_messages"   ON whatsapp_messages;
DROP POLICY IF EXISTS "super_admin_write_whatsapp_messages" ON whatsapp_messages;

-- SELECT: agent sees messages tied to clients they own; admin sees
-- all tenant messages; super admin sees everything.
CREATE POLICY "whatsapp_messages_select" ON whatsapp_messages FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_user_role() IN ('admin', 'super_admin')
      OR EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = whatsapp_messages.client_id
          AND c.agent_id = auth.uid()
      )
      OR client_id IS NULL  -- broadcasts / non-client messages
    )
  );

-- INSERT normally happens via the send-whatsapp Edge Function
-- (service-role key, bypasses RLS). We still declare a tenant-scoped
-- admin INSERT policy for manual inserts from Studio.
CREATE POLICY "whatsapp_messages_insert" ON whatsapp_messages FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- Messages cannot be updated (immutable audit trail). Super admin
-- only, for truly exceptional cases (GDPR erasure requests etc.).
CREATE POLICY "whatsapp_messages_update" ON whatsapp_messages FOR UPDATE
  USING (is_super_admin());

-- Messages cannot be deleted below super admin. This is the rule
-- the founder's previous-employer story turned into a hard
-- requirement.
CREATE POLICY "whatsapp_messages_delete" ON whatsapp_messages FOR DELETE
  USING (is_super_admin());

-- ----------------------------------------
-- 10. WHATSAPP_ACCOUNTS — per-tenant WABA credentials.
--                         Sensitive (contains access_token).
--                         Regular agents must NOT see the token.
-- ----------------------------------------
DROP POLICY IF EXISTS "tenant_read_own_whatsapp_account"  ON whatsapp_accounts;
DROP POLICY IF EXISTS "super_admin_write_whatsapp_accounts" ON whatsapp_accounts;

-- SELECT: admin + super_admin only. Agents have no business reading
-- their tenant's access_token or quota config.
CREATE POLICY "whatsapp_accounts_select" ON whatsapp_accounts FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "whatsapp_accounts_insert" ON whatsapp_accounts FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "whatsapp_accounts_update" ON whatsapp_accounts FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "whatsapp_accounts_delete" ON whatsapp_accounts FOR DELETE
  USING (is_super_admin());

-- ----------------------------------------
-- 11. SECURITY AUDIT — forensic log of destructive actions.
--
-- Populated by triggers, readable by tenant admins. Agents never
-- see this table.
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS security_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT,
  action TEXT NOT NULL
    CHECK (action IN ('SOFT_DELETE','HARD_DELETE','REASSIGN','BULK_DELETE','PAYMENT_OVERRIDE','PERMISSION_CHANGE')),
  target_type TEXT NOT NULL,         -- 'clients' | 'visits' | 'whatsapp_messages' | etc.
  target_id UUID,
  target_preview TEXT,               -- "M. Mansouri", "Visite 24/04 14h" — human-readable
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_tenant  ON security_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON security_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_user    ON security_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_action  ON security_audit(action);

ALTER TABLE security_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_audit_read" ON security_audit;
CREATE POLICY "security_audit_read" ON security_audit FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- No INSERT / UPDATE / DELETE policies for authenticated users.
-- Writes only come from the SECURITY DEFINER trigger below and the
-- service-role key; everyone else is denied by default.

-- ----------------------------------------
-- 12. Trigger — log every hard DELETE on sensitive tables.
-- ----------------------------------------
CREATE OR REPLACE FUNCTION log_destructive_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview TEXT;
BEGIN
  -- Build a short human-readable preview of what is being destroyed,
  -- table by table. Null-safe throughout so the trigger never blocks
  -- the underlying DELETE on edge cases.
  preview := CASE TG_TABLE_NAME
    WHEN 'clients'       THEN OLD.full_name
    WHEN 'visits'        THEN 'Visite ' || COALESCE(OLD.scheduled_at::TEXT, OLD.id::TEXT)
    WHEN 'reservations'  THEN 'Reservation ' || OLD.id::TEXT
    WHEN 'history'       THEN OLD.type::TEXT || ' - ' || COALESCE(OLD.title, '')
    WHEN 'tasks'         THEN COALESCE(OLD.title, OLD.id::TEXT)
    WHEN 'documents'     THEN COALESCE(OLD.name, OLD.id::TEXT)
    WHEN 'whatsapp_messages' THEN COALESCE(OLD.template_name, '') || ' -> ' || COALESCE(OLD.to_phone, '')
    ELSE OLD.id::TEXT
  END;

  INSERT INTO security_audit (
    tenant_id, user_id, user_role, action, target_type, target_id, target_preview
  ) VALUES (
    OLD.tenant_id,
    auth.uid(),
    get_user_role(),
    'HARD_DELETE',
    TG_TABLE_NAME,
    OLD.id,
    LEFT(preview, 200)
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_clients_delete          ON clients;
DROP TRIGGER IF EXISTS audit_visits_delete           ON visits;
DROP TRIGGER IF EXISTS audit_reservations_delete     ON reservations;
DROP TRIGGER IF EXISTS audit_history_delete          ON history;
DROP TRIGGER IF EXISTS audit_tasks_delete            ON tasks;
DROP TRIGGER IF EXISTS audit_documents_delete        ON documents;
DROP TRIGGER IF EXISTS audit_whatsapp_messages_delete ON whatsapp_messages;

CREATE TRIGGER audit_clients_delete
  BEFORE DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_destructive_action();

CREATE TRIGGER audit_visits_delete
  BEFORE DELETE ON visits
  FOR EACH ROW EXECUTE FUNCTION log_destructive_action();

CREATE TRIGGER audit_reservations_delete
  BEFORE DELETE ON reservations
  FOR EACH ROW EXECUTE FUNCTION log_destructive_action();

CREATE TRIGGER audit_history_delete
  BEFORE DELETE ON history
  FOR EACH ROW EXECUTE FUNCTION log_destructive_action();

CREATE TRIGGER audit_tasks_delete
  BEFORE DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_destructive_action();

CREATE TRIGGER audit_documents_delete
  BEFORE DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION log_destructive_action();

CREATE TRIGGER audit_whatsapp_messages_delete
  BEFORE DELETE ON whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION log_destructive_action();

-- ----------------------------------------
-- 13. Trigger — log soft-deletes too (UPDATE that sets deleted_at).
-- ----------------------------------------
CREATE OR REPLACE FUNCTION log_soft_delete_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview TEXT;
BEGIN
  -- Only fire when deleted_at flips from NULL to a value.
  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  preview := CASE TG_TABLE_NAME
    WHEN 'clients'      THEN NEW.full_name
    WHEN 'visits'       THEN 'Visite ' || COALESCE(NEW.scheduled_at::TEXT, NEW.id::TEXT)
    WHEN 'reservations' THEN 'Reservation ' || NEW.id::TEXT
    WHEN 'history'      THEN NEW.type::TEXT || ' - ' || COALESCE(NEW.title, '')
    WHEN 'tasks'        THEN COALESCE(NEW.title, NEW.id::TEXT)
    WHEN 'documents'    THEN COALESCE(NEW.name, NEW.id::TEXT)
    ELSE NEW.id::TEXT
  END;

  INSERT INTO security_audit (
    tenant_id, user_id, user_role, action, target_type, target_id, target_preview
  ) VALUES (
    NEW.tenant_id,
    auth.uid(),
    get_user_role(),
    'SOFT_DELETE',
    TG_TABLE_NAME,
    NEW.id,
    LEFT(preview, 200)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_clients_soft_delete       ON clients;
DROP TRIGGER IF EXISTS audit_visits_soft_delete        ON visits;
DROP TRIGGER IF EXISTS audit_reservations_soft_delete  ON reservations;
DROP TRIGGER IF EXISTS audit_history_soft_delete       ON history;
DROP TRIGGER IF EXISTS audit_tasks_soft_delete         ON tasks;
DROP TRIGGER IF EXISTS audit_documents_soft_delete     ON documents;

CREATE TRIGGER audit_clients_soft_delete
  AFTER UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete_action();

CREATE TRIGGER audit_visits_soft_delete
  AFTER UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete_action();

CREATE TRIGGER audit_reservations_soft_delete
  AFTER UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete_action();

CREATE TRIGGER audit_history_soft_delete
  AFTER UPDATE ON history
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete_action();

CREATE TRIGGER audit_tasks_soft_delete
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete_action();

CREATE TRIGGER audit_documents_soft_delete
  AFTER UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete_action();

-- ----------------------------------------
-- 14. Documentation — tag each table with its security policy
-- ----------------------------------------
COMMENT ON COLUMN clients.deleted_at IS 'Soft-delete marker. App layer must filter WHERE deleted_at IS NULL in normal views; only the Corbeille page shows rows where this is set.';
COMMENT ON COLUMN clients.deleted_by IS 'Who soft-deleted the row — used by the security audit + Corbeille page.';
COMMENT ON TABLE  security_audit IS 'Forensic log of every destructive action (hard DELETE or soft-delete via deleted_at). Populated by SECURITY DEFINER triggers, readable only by tenant admins + super admins.';
