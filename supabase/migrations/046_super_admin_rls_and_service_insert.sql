-- 046_super_admin_rls_and_service_insert.sql
-- ────────────────────────────────────────────────────────────────────
-- Three audit findings, one migration:
--
--   B5. The DO loop in 001_create_tables.sql line 476-503 generates
--       *_tenant_select/insert/update/delete on projects, units,
--       agent_goals, tenant_settings, document_templates without
--       any `OR is_super_admin()`. get_my_tenant_id() returns NULL
--       for super_admin (who has no tenant_id), so every super-admin
--       SELECT/UPDATE/etc. on these tables silently returns zero
--       rows. /admin/tenants and /admin/global-stats display zero
--       projects, zero sales, zero objectives — bug, not feature.
--       Sales / payment_schedules / charges / sale_amenities were
--       fixed in migration 045; this migration covers the rest.
--
--   B6. service_insert_* policies on email_logs (012), api_costs
--       (034), quota_alerts_sent (039) are declared with
--       WITH CHECK (true) and TO PUBLIC implicit. Any authenticated
--       user can INSERT arbitrary rows, polluting the cost dashboard
--       and email/quota tracking. Tighten to TO service_role only.
--
--   D4. whatsapp_messages.wa_message_id has an index but no UNIQUE
--       constraint. Meta retries aggressively on 5xx/timeouts, so
--       the same message arrives twice and we insert duplicates.
--       The auto-close path then fires multiple times for one client
--       reply. Add a UNIQUE constraint and document the upsert path
--       the webhook should use.
-- ────────────────────────────────────────────────────────────────────

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- B5. Add OR is_super_admin() to projects / units / agent_goals /
-- tenant_settings / document_templates.
-- ════════════════════════════════════════════════════════════════════

-- ── projects ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_tenant_select" ON projects;
DROP POLICY IF EXISTS "projects_tenant_insert" ON projects;
DROP POLICY IF EXISTS "projects_tenant_update" ON projects;
DROP POLICY IF EXISTS "projects_tenant_delete" ON projects;

CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());
CREATE POLICY "projects_insert" ON projects FOR INSERT
  WITH CHECK (is_super_admin() OR tenant_id = get_my_tenant_id());
CREATE POLICY "projects_update" ON projects FOR UPDATE
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());
CREATE POLICY "projects_delete" ON projects FOR DELETE
  USING (is_super_admin() OR (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  ));

-- ── units ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "units_tenant_select" ON units;
DROP POLICY IF EXISTS "units_tenant_insert" ON units;
DROP POLICY IF EXISTS "units_tenant_update" ON units;
DROP POLICY IF EXISTS "units_tenant_delete" ON units;

CREATE POLICY "units_select" ON units FOR SELECT
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());
CREATE POLICY "units_insert" ON units FOR INSERT
  WITH CHECK (is_super_admin() OR tenant_id = get_my_tenant_id());
CREATE POLICY "units_update" ON units FOR UPDATE
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());
CREATE POLICY "units_delete" ON units FOR DELETE
  USING (is_super_admin() OR (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  ));

-- ── agent_goals ─────────────────────────────────────────────────────
-- Agents see their own goals, admin/super_admin see every goal in
-- the tenant.
DROP POLICY IF EXISTS "agent_goals_tenant_select" ON agent_goals;
DROP POLICY IF EXISTS "agent_goals_tenant_insert" ON agent_goals;
DROP POLICY IF EXISTS "agent_goals_tenant_update" ON agent_goals;
DROP POLICY IF EXISTS "agent_goals_tenant_delete" ON agent_goals;

CREATE POLICY "agent_goals_select" ON agent_goals FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND (get_user_role() IN ('admin', 'super_admin') OR agent_id = auth.uid())
    )
  );
CREATE POLICY "agent_goals_insert" ON agent_goals FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );
CREATE POLICY "agent_goals_update" ON agent_goals FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );
CREATE POLICY "agent_goals_delete" ON agent_goals FOR DELETE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );

-- ── tenant_settings ─────────────────────────────────────────────────
-- Only admin/super_admin should manage tenant settings; agents read.
DROP POLICY IF EXISTS "tenant_settings_tenant_select" ON tenant_settings;
DROP POLICY IF EXISTS "tenant_settings_tenant_insert" ON tenant_settings;
DROP POLICY IF EXISTS "tenant_settings_tenant_update" ON tenant_settings;
DROP POLICY IF EXISTS "tenant_settings_tenant_delete" ON tenant_settings;

CREATE POLICY "tenant_settings_select" ON tenant_settings FOR SELECT
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());
CREATE POLICY "tenant_settings_insert" ON tenant_settings FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );
CREATE POLICY "tenant_settings_update" ON tenant_settings FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );
CREATE POLICY "tenant_settings_delete" ON tenant_settings FOR DELETE
  USING (is_super_admin());

-- ── document_templates ──────────────────────────────────────────────
DROP POLICY IF EXISTS "document_templates_tenant_select" ON document_templates;
DROP POLICY IF EXISTS "document_templates_tenant_insert" ON document_templates;
DROP POLICY IF EXISTS "document_templates_tenant_update" ON document_templates;
DROP POLICY IF EXISTS "document_templates_tenant_delete" ON document_templates;

CREATE POLICY "document_templates_select" ON document_templates FOR SELECT
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());
CREATE POLICY "document_templates_insert" ON document_templates FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );
CREATE POLICY "document_templates_update" ON document_templates FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );
CREATE POLICY "document_templates_delete" ON document_templates FOR DELETE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- B6. Tighten service_insert_* to service_role only.
-- ════════════════════════════════════════════════════════════════════
-- These tables are written exclusively by Edge Functions running with
-- the service-role key. A regular authenticated user must NOT be able
-- to INSERT — otherwise any frontend code (or a malicious user) could
-- pollute the cost dashboard, email logs, or quota alerts.

DROP POLICY IF EXISTS "service_insert_email_logs" ON email_logs;
CREATE POLICY "service_insert_email_logs" ON email_logs
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_insert_api_costs" ON api_costs;
CREATE POLICY "service_insert_api_costs" ON api_costs
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_insert_quota_alerts" ON quota_alerts_sent;
CREATE POLICY "service_insert_quota_alerts" ON quota_alerts_sent
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- D4. UNIQUE on whatsapp_messages.wa_message_id.
-- ════════════════════════════════════════════════════════════════════
-- Meta retries on 5xx/timeouts. Without UNIQUE, two retries of the
-- same message create two rows, the auto-close fires twice, and the
-- inbox shows duplicates. Add a partial UNIQUE index (NULL allowed
-- because outbound messages get their wa_message_id later, after the
-- API call returns).
--
-- The webhook still needs to switch to upsert (ON CONFLICT
-- (wa_message_id) DO UPDATE) — done in a follow-up Edge Function
-- commit; the constraint here makes the upsert correct.

DROP INDEX IF EXISTS idx_whatsapp_messages_wa_id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_whatsapp_messages_wa_id
  ON whatsapp_messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

COMMENT ON INDEX uniq_whatsapp_messages_wa_id IS
  'Idempotency guard against Meta webhook retries. Replaces the '
  'non-unique idx_whatsapp_messages_wa_id from migration 030.';

-- ════════════════════════════════════════════════════════════════════
-- D5. Atomic increment for whatsapp_accounts.messages_sent.
-- ════════════════════════════════════════════════════════════════════
-- send-whatsapp currently runs a read-then-write
-- (messages_sent + 1) which loses races when concurrent sends fire
-- (e.g., a cron batch). The quota check passes for both, then both
-- increment from the same baseline, undercounting. Expose an atomic
-- RPC so the Edge Function can stop reading-before-writing.

CREATE OR REPLACE FUNCTION increment_whatsapp_messages_sent(
  p_tenant_id UUID,
  p_delta INT DEFAULT 1
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE whatsapp_accounts
  SET messages_sent = COALESCE(messages_sent, 0) + p_delta
  WHERE tenant_id = p_tenant_id
  RETURNING messages_sent INTO new_count;
  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_whatsapp_messages_sent(UUID, INT) TO service_role;

COMMENT ON FUNCTION increment_whatsapp_messages_sent IS
  'Atomic counter bump for whatsapp_accounts.messages_sent. '
  'Service-role-only — called from send-whatsapp to avoid the '
  'read-then-write race condition flagged in the 28-Apr-2026 audit.';

-- ════════════════════════════════════════════════════════════════════
-- D6. increment_landing_submissions RPC — was being called from
-- capture-lead but never created. Frontend fallback was a floating
-- Promise so the counter was effectively never bumped.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_landing_submissions(
  page_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE landing_pages
  SET submissions_count = COALESCE(submissions_count, 0) + 1,
      updated_at = NOW()
  WHERE id = page_id
  RETURNING submissions_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_landing_submissions(UUID)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION increment_landing_submissions IS
  'Atomic submission counter bump for landing_pages. Called from '
  'capture-lead Edge Function (anon-callable since landing pages '
  'are public). Replaces the orphan RPC reference flagged in '
  'capture-lead/index.ts:88 (audit finding D6).';

COMMIT;
