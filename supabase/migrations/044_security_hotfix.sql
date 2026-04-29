-- 044_security_hotfix.sql
-- ────────────────────────────────────────────────────────────────────
-- Security hotfix from the 28-Apr-2026 deep audit. Closes 4 critical
-- holes that were exploitable in production:
--
--   B1. Six tables created in migration 011 had no RLS at all
--       (invoices, platform_messages, changelogs, support_tickets,
--       ticket_messages, platform_alerts). Any authenticated user
--       could read/modify another tenant's billing and tickets.
--
--   B2. landing_pages had a public anon SELECT policy that exposed
--       Meta/TikTok/Google access tokens (column-level grant lock).
--
--   B3. marketing_leads had a UPDATE policy with USING(true)
--       WITH CHECK(true) — anyone with the anon key could rewrite
--       any lead by guessing its UUID. Replaced with a SECURITY
--       DEFINER RPC that requires email match.
--
--   C1. users_update_self had no WITH CHECK on role/tenant_id —
--       an agent could promote themselves to admin or relocate to
--       another tenant in one UPDATE. Replaced with a BEFORE UPDATE
--       trigger that raises if non-super-admin tries to change
--       privileged fields.
-- ────────────────────────────────────────────────────────────────────

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- B1. Lock down the 6 super-admin / billing tables from migration 011.
-- ════════════════════════════════════════════════════════════════════

-- invoices: super_admin only (sensitive billing data per tenant)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_super_admin_all" ON invoices;
CREATE POLICY "invoices_super_admin_all" ON invoices
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "invoices_tenant_read_own" ON invoices;
CREATE POLICY "invoices_tenant_read_own" ON invoices
  FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- platform_messages: super_admin manages, target tenant can read
ALTER TABLE platform_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_messages_super_admin_all" ON platform_messages;
CREATE POLICY "platform_messages_super_admin_all" ON platform_messages
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "platform_messages_tenant_read" ON platform_messages;
CREATE POLICY "platform_messages_tenant_read" ON platform_messages
  FOR SELECT
  USING (
    to_tenant_id = get_my_tenant_id()
    OR to_tenant_id IS NULL
  );

-- changelogs: read-only for everyone (announcements), super_admin writes
ALTER TABLE changelogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "changelogs_authenticated_read" ON changelogs;
CREATE POLICY "changelogs_authenticated_read" ON changelogs
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "changelogs_super_admin_write" ON changelogs;
CREATE POLICY "changelogs_super_admin_write" ON changelogs
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- support_tickets: tenant scope (tenant admins can see their tenant's
-- tickets, agents can see only their own). Super admin sees all.
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_super_admin_all" ON support_tickets;
CREATE POLICY "support_tickets_super_admin_all" ON support_tickets
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "support_tickets_tenant_read" ON support_tickets;
CREATE POLICY "support_tickets_tenant_read" ON support_tickets
  FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_user_role() IN ('admin', 'super_admin')
      OR user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_tickets_user_create" ON support_tickets;
CREATE POLICY "support_tickets_user_create" ON support_tickets
  FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "support_tickets_admin_update" ON support_tickets;
CREATE POLICY "support_tickets_admin_update" ON support_tickets
  FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- ticket_messages: same scope as parent ticket
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_messages_super_admin_all" ON ticket_messages;
CREATE POLICY "ticket_messages_super_admin_all" ON ticket_messages
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "ticket_messages_thread_read" ON ticket_messages;
CREATE POLICY "ticket_messages_thread_read" ON ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND t.tenant_id = get_my_tenant_id()
        AND (
          get_user_role() IN ('admin', 'super_admin')
          OR t.user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "ticket_messages_thread_insert" ON ticket_messages;
CREATE POLICY "ticket_messages_thread_insert" ON ticket_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND t.tenant_id = get_my_tenant_id()
        AND (
          get_user_role() IN ('admin', 'super_admin')
          OR t.user_id = auth.uid()
        )
    )
  );

-- platform_alerts: super_admin only (internal monitoring config)
ALTER TABLE platform_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_alerts_super_admin_all" ON platform_alerts;
CREATE POLICY "platform_alerts_super_admin_all" ON platform_alerts
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ════════════════════════════════════════════════════════════════════
-- B2. Restrict landing_pages public SELECT to safe columns only.
-- ════════════════════════════════════════════════════════════════════
-- The previous public SELECT policy returned every column to anon,
-- including meta_access_token, tiktok_access_token, google_api_secret.
-- Postgres RLS doesn't gate columns directly, so we use column-level
-- GRANTs: REVOKE all SELECT from anon, then GRANT SELECT only on the
-- columns the public landing-page renderer actually needs.

REVOKE SELECT ON landing_pages FROM anon;

-- Re-grant only the columns required to render the public page. The 4
-- secret columns (meta_access_token, meta_test_event_code,
-- google_api_secret, tiktok_access_token) are deliberately excluded.
-- If you add a new public-facing column, GRANT SELECT on it here.
GRANT SELECT (
  id,
  tenant_id,
  project_id,
  slug,
  title,
  description,
  cover_image_url,
  accent_color,
  form_fields,
  default_agent_id,
  default_source,
  meta_pixel_id,
  google_tag_id,
  tiktok_pixel_id,
  google_measurement_id,
  custom_head_scripts,
  views_count,
  submissions_count,
  is_active,
  distribution_mode,
  last_assigned_agent_idx,
  created_at,
  updated_at
) ON landing_pages TO anon;

-- Tenant-scoped admins keep full access via existing tenant policies.
GRANT SELECT, INSERT, UPDATE, DELETE ON landing_pages TO authenticated;

COMMENT ON TABLE landing_pages IS
  'Tenant landing pages. anon (public renderer) has SELECT only on '
  'safe display columns — secrets like meta_access_token, '
  'tiktok_access_token, google_api_secret are explicitly NOT '
  'granted to anon (column-level GRANT in migration 044).';

-- ════════════════════════════════════════════════════════════════════
-- B3. marketing_leads: replace USING(true) UPDATE with a SECURITY
-- DEFINER RPC that requires email match.
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "public_update_own_lead" ON marketing_leads;

-- Anonymous step-2 form callers go through this RPC, which checks
-- the email matches before applying the update. Without the email
-- the lead UUID alone is useless.
CREATE OR REPLACE FUNCTION update_marketing_lead_step2(
  p_lead_id UUID,
  p_email TEXT,
  p_company_name TEXT DEFAULT NULL,
  p_activity_type TEXT DEFAULT NULL,
  p_agents_count TEXT DEFAULT NULL,
  p_leads_per_month TEXT DEFAULT NULL,
  p_marketing_budget_monthly TEXT DEFAULT NULL,
  p_current_tools TEXT DEFAULT NULL,
  p_decision_maker TEXT DEFAULT NULL,
  p_frustration_score INT DEFAULT NULL,
  p_timeline TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched BOOLEAN := FALSE;
BEGIN
  UPDATE marketing_leads
  SET
    company_name = COALESCE(p_company_name, company_name),
    activity_type = COALESCE(p_activity_type, activity_type),
    agents_count = COALESCE(p_agents_count, agents_count),
    leads_per_month = COALESCE(p_leads_per_month, leads_per_month),
    marketing_budget_monthly = COALESCE(p_marketing_budget_monthly, marketing_budget_monthly),
    current_tools = COALESCE(p_current_tools, current_tools),
    decision_maker = COALESCE(p_decision_maker, decision_maker),
    frustration_score = COALESCE(p_frustration_score, frustration_score),
    timeline = COALESCE(p_timeline, timeline),
    message = COALESCE(p_message, message),
    step_completed = 2,
    updated_at = NOW()
  WHERE id = p_lead_id
    AND lower(email) = lower(p_email);

  GET DIAGNOSTICS matched = ROW_COUNT;
  RETURN matched > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION update_marketing_lead_step2(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT
) TO anon, authenticated;

COMMENT ON FUNCTION update_marketing_lead_step2 IS
  'Public RPC for marketing form step 2. Requires email match against '
  'the existing lead — prevents anonymous attackers from rewriting '
  'leads they didn''t create. Replaces the USING(true) WITH CHECK(true) '
  'public_update_own_lead policy (dropped in migration 044).';

-- The marketing site (immoprox-marketing-website repo) MUST be
-- updated to call this RPC instead of supabase.from('marketing_leads')
-- .update(...). See ROADMAP > Tech Debt section.

-- ════════════════════════════════════════════════════════════════════
-- C1. Prevent role/tenant_id escalation via users_update_self.
-- ════════════════════════════════════════════════════════════════════
-- The existing policy (USING id = auth.uid(), no WITH CHECK) let any
-- authenticated user run UPDATE users SET role='admin' WHERE id =
-- auth.uid() and instantly become an admin. We can't easily express
-- "role unchanged unless super_admin" inside RLS without recursive
-- self-queries, so we use a BEFORE UPDATE trigger.

CREATE OR REPLACE FUNCTION prevent_user_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super admin can change anything.
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Tenant admin can update users in their tenant but cannot change
  -- a user's role to super_admin nor move them to another tenant.
  IF get_user_role() = 'admin'
     AND OLD.tenant_id = get_my_tenant_id()
     AND NEW.tenant_id = OLD.tenant_id
     AND NEW.role <> 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- Self-update path (non-admin user updating their own profile).
  -- Block any change to role, status, tenant_id, or permission_profile_id.
  IF NEW.id = auth.uid() THEN
    IF NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Cannot change own role (super admin only).'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Cannot change own tenant (super admin only).'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Cannot change own status (admin only).'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.permission_profile_id IS DISTINCT FROM OLD.permission_profile_id THEN
      RAISE EXCEPTION 'Cannot change own permission profile (admin only).'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Not super_admin, not tenant_admin, not self → block.
  RAISE EXCEPTION 'Unauthorized user update.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS prevent_user_escalation ON users;
CREATE TRIGGER prevent_user_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_user_privilege_escalation();

COMMENT ON FUNCTION prevent_user_privilege_escalation IS
  'Enforces that non-super-admin users cannot change their own role, '
  'tenant_id, status, or permission_profile_id via the '
  'users_update_self RLS policy. Tenant admins can update other users '
  'in their tenant but cannot promote anyone to super_admin or move '
  'them across tenants. Closes the privilege escalation vector flagged '
  'in the 28-Apr-2026 audit.';

COMMIT;
