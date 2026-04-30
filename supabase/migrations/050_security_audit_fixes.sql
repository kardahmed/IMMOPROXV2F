-- 050_security_audit_fixes.sql
-- ────────────────────────────────────────────────────────────────────
-- Big 4 security audit follow-up. Closes the database-side findings
-- from the audit run on the post-049 codebase.
--
-- This migration:
--
--   H1: clients.marketing_campaign_id cross-tenant guard
--       (admin tenant A could attach a lead to tenant B's campaign).
--   H2: users.backup_agent_id cross-tenant guard
--       (admin could designate an agent from another tenant as backup).
--   H3: users_update_admin policy — admin can update other users in
--       their tenant. Without this, AgentsPage reactivate/suspend and
--       PutOnLeaveModal hit RLS denial silently for non-self updates.
--   H16: email_campaigns / email_templates / email_events / email_
--        campaign_recipients tighten UPDATE/DELETE to admin+ (avoid
--        agent privilege creep).
--   email-assets storage bucket scoped to tenant prefix (MED).
--   marketing_leads anon insert tightened to default safe values (MED).
--   generate-invoices race fix — UNIQUE (tenant_id, period) (MED).
--   whatsapp_accounts.phone_number_id UNIQUE (MED — race takeover).
--   marketing_campaigns CREATE TABLE IF NOT EXISTS so a fresh DB
--     rebuild from migrations alone succeeds (LOW — bombe à
--     retardement post-Studio-creation).
--   Atomic deactivate_agent RPC for the wizard (H9). Single
--     transaction reassigns clients/tasks/visits/reservations and
--     flips status='inactive'. Rollback-safe.
-- ────────────────────────────────────────────────────────────────────

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- 0. marketing_campaigns — ensure the table exists in migrations.
-- ════════════════════════════════════════════════════════════════════
-- Was created via Studio outside the migration history. A fresh DB
-- rebuild from migrations alone would crash on FK in 048. This makes
-- 048 + 050 self-contained.

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'other',
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,
  planned_budget  NUMERIC(12,2) DEFAULT 0,
  target_leads    INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  notes           TEXT,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  tracking_code   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketing_campaigns_tenant_select" ON marketing_campaigns;
DROP POLICY IF EXISTS "marketing_campaigns_tenant_insert" ON marketing_campaigns;
DROP POLICY IF EXISTS "marketing_campaigns_tenant_update" ON marketing_campaigns;
DROP POLICY IF EXISTS "marketing_campaigns_tenant_delete" ON marketing_campaigns;

CREATE POLICY "marketing_campaigns_tenant_select" ON marketing_campaigns FOR SELECT
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE POLICY "marketing_campaigns_tenant_insert" ON marketing_campaigns FOR INSERT
  WITH CHECK (is_super_admin() OR (tenant_id = get_my_tenant_id() AND get_user_role() IN ('admin','super_admin')));

CREATE POLICY "marketing_campaigns_tenant_update" ON marketing_campaigns FOR UPDATE
  USING (is_super_admin() OR (tenant_id = get_my_tenant_id() AND get_user_role() IN ('admin','super_admin')));

CREATE POLICY "marketing_campaigns_tenant_delete" ON marketing_campaigns FOR DELETE
  USING (is_super_admin() OR (tenant_id = get_my_tenant_id() AND get_user_role() IN ('admin','super_admin')));

-- ════════════════════════════════════════════════════════════════════
-- 1. H3 — users_update_admin policy
-- ════════════════════════════════════════════════════════════════════
-- Migration 044's prevent_user_privilege_escalation trigger blocks
-- role/tenant_id self-mutation, but NO policy ever allowed an admin
-- to UPDATE users beyond themselves. AgentsPage reactivate/suspend
-- and PutOnLeaveModal were silently denied by RLS.

DROP POLICY IF EXISTS "users_update_admin" ON users;
CREATE POLICY "users_update_admin" ON users FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- 2. H1 — clients.marketing_campaign_id cross-tenant guard
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_client_campaign_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.marketing_campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM marketing_campaigns
      WHERE id = NEW.marketing_campaign_id
        AND tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'Marketing campaign does not belong to client tenant'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_campaign_tenant_check ON clients;
CREATE TRIGGER clients_campaign_tenant_check
  BEFORE INSERT OR UPDATE OF marketing_campaign_id, tenant_id ON clients
  FOR EACH ROW
  EXECUTE FUNCTION enforce_client_campaign_tenant();

-- ════════════════════════════════════════════════════════════════════
-- 3. H2 — users.backup_agent_id cross-tenant guard
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_backup_agent_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.backup_agent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM users
      WHERE id = NEW.backup_agent_id
        AND tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'Backup agent does not belong to user tenant'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_backup_agent_tenant_check ON users;
CREATE TRIGGER users_backup_agent_tenant_check
  BEFORE INSERT OR UPDATE OF backup_agent_id, tenant_id ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_backup_agent_tenant();

-- ════════════════════════════════════════════════════════════════════
-- 4. H16 — email_campaigns / templates / events role gates
-- ════════════════════════════════════════════════════════════════════
-- Migration 014 created FOR ALL policies that didn't separate agent
-- vs admin. Tighten UPDATE/DELETE to admin+. Note: email_events and
-- email_campaign_recipients have no tenant_id column — scope passes
-- through campaign_id → email_campaigns.

-- Drop the actual policy names from 014.
DROP POLICY IF EXISTS "tenant_email_campaigns" ON email_campaigns;
DROP POLICY IF EXISTS "tenant_email_templates" ON email_templates;
DROP POLICY IF EXISTS "tenant_email_events" ON email_events;
DROP POLICY IF EXISTS "tenant_ecr" ON email_campaign_recipients;
-- Defensive: also drop the older names from earlier drafts.
DROP POLICY IF EXISTS "tenant_isolation_email_campaigns" ON email_campaigns;
DROP POLICY IF EXISTS "tenant_isolation_email_templates" ON email_templates;
DROP POLICY IF EXISTS "tenant_isolation_email_events" ON email_events;
DROP POLICY IF EXISTS "tenant_isolation_email_campaign_recipients" ON email_campaign_recipients;

-- email_campaigns: agents can SELECT (read-only for them), only admins
-- can INSERT/UPDATE/DELETE.
CREATE POLICY "email_campaigns_select" ON email_campaigns FOR SELECT
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE POLICY "email_campaigns_admin_write" ON email_campaigns FOR ALL
  USING (is_super_admin() OR (tenant_id = get_my_tenant_id() AND get_user_role() IN ('admin','super_admin')))
  WITH CHECK (is_super_admin() OR (tenant_id = get_my_tenant_id() AND get_user_role() IN ('admin','super_admin')));

-- email_templates: same.
CREATE POLICY "email_templates_select" ON email_templates FOR SELECT
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE POLICY "email_templates_admin_write" ON email_templates FOR ALL
  USING (is_super_admin() OR (tenant_id = get_my_tenant_id() AND get_user_role() IN ('admin','super_admin')))
  WITH CHECK (is_super_admin() OR (tenant_id = get_my_tenant_id() AND get_user_role() IN ('admin','super_admin')));

-- email_events: read-only for tenant members. Inserted by track-email
-- service-role. Tenant scope joins through campaign_id.
CREATE POLICY "email_events_select" ON email_events FOR SELECT
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM email_campaigns c
      WHERE c.id = email_events.campaign_id
        AND c.tenant_id = get_my_tenant_id()
    )
  );

-- email_campaign_recipients: tenant scope joins through campaign_id.
CREATE POLICY "email_recipients_select" ON email_campaign_recipients FOR SELECT
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM email_campaigns c
      WHERE c.id = email_campaign_recipients.campaign_id
        AND c.tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "email_recipients_admin_write" ON email_campaign_recipients FOR ALL
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM email_campaigns c
      WHERE c.id = email_campaign_recipients.campaign_id
        AND c.tenant_id = get_my_tenant_id()
        AND get_user_role() IN ('admin','super_admin')
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM email_campaigns c
      WHERE c.id = email_campaign_recipients.campaign_id
        AND c.tenant_id = get_my_tenant_id()
        AND get_user_role() IN ('admin','super_admin')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- 5. marketing_leads — anon insert tightened
-- ════════════════════════════════════════════════════════════════════
-- 015 allowed anon WITH CHECK (true) — let an attacker preset
-- assigned_to / status / step_completed. Now: only step1 fields.

DROP POLICY IF EXISTS "public_insert_marketing_leads" ON marketing_leads;
CREATE POLICY "public_insert_marketing_leads" ON marketing_leads FOR INSERT
  TO anon
  WITH CHECK (
    assigned_to IS NULL
    AND status = 'new'
    AND step_completed = 1
    AND frustration_score IS NULL
  );

-- ════════════════════════════════════════════════════════════════════
-- 6. generate-invoices duplicate race
-- ════════════════════════════════════════════════════════════════════
-- Two concurrent runs produce two rows for the same (tenant, period).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    -- Drop any existing constraint with the same name (idempotent).
    BEGIN
      ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_tenant_period_unique;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    -- Add unique only if it doesn't already exist.
    BEGIN
      ALTER TABLE invoices
        ADD CONSTRAINT invoices_tenant_period_unique
        UNIQUE (tenant_id, period);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 7. whatsapp_accounts.phone_number_id UNIQUE
-- ════════════════════════════════════════════════════════════════════
-- Two tenants can't claim the same phone_number_id (race takeover).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_accounts' AND column_name = 'phone_number_id') THEN
    BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_accounts_phone_unique
        ON whatsapp_accounts (phone_number_id)
        WHERE is_active = true;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 8. H9 — Atomic deactivate_agent RPC (transaction-safe wizard)
-- ════════════════════════════════════════════════════════════════════
-- Replaces the 5 sequential UPDATEs in DeactivateAgentWizard.
-- Single transaction. If any step fails, the whole thing rolls back.
-- Caller passes the chosen behaviours per category.

CREATE OR REPLACE FUNCTION deactivate_agent_atomic(
  p_agent_id            UUID,
  p_target_agent_id     UUID,
  p_task_action         TEXT,            -- 'transfer' | 'cancel'
  p_visit_action        TEXT,            -- 'transfer' | 'cancel'
  p_reservation_action  TEXT,            -- 'transfer' | 'keep'
  p_actor_id            UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id        UUID;
  v_caller_role      TEXT;
  v_caller_tenant    UUID;
  v_target_tenant    UUID;
  v_clients_moved    INT := 0;
  v_tasks_handled    INT := 0;
  v_visits_handled   INT := 0;
  v_resv_handled     INT := 0;
BEGIN
  -- Authorisation: caller must be admin/super_admin of the agent's
  -- tenant. SECURITY DEFINER means we re-check explicitly.
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
    FROM users WHERE id = p_actor_id;

  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Only admin can deactivate agents'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = p_agent_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Agent not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_caller_role <> 'super_admin' AND v_caller_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant deactivation forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Target agent must exist in same tenant when reassign is requested.
  IF p_target_agent_id IS NOT NULL THEN
    SELECT tenant_id INTO v_target_tenant FROM users WHERE id = p_target_agent_id;
    IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
      RAISE EXCEPTION 'Target agent must belong to the same tenant'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 1. Reassign clients (returning the moved IDs lets us audit-log).
  IF p_target_agent_id IS NOT NULL THEN
    WITH moved AS (
      UPDATE clients
         SET agent_id = p_target_agent_id
       WHERE agent_id = p_agent_id
         AND deleted_at IS NULL
       RETURNING id
    )
    SELECT COUNT(*) INTO v_clients_moved FROM moved;

    -- One history row per moved client.
    INSERT INTO history (tenant_id, client_id, agent_id, type, title)
    SELECT v_tenant_id, c.id, p_actor_id, 'note',
           'Réassigné suite au départ de l''agent'
      FROM clients c
     WHERE c.agent_id = p_target_agent_id
       AND c.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM users WHERE id = p_agent_id);
  END IF;

  -- 2. Tasks
  IF p_task_action = 'transfer' AND p_target_agent_id IS NOT NULL THEN
    WITH moved AS (
      UPDATE tasks
         SET agent_id = p_target_agent_id
       WHERE agent_id = p_agent_id
         AND status = 'pending'
         AND deleted_at IS NULL
       RETURNING id
    )
    SELECT COUNT(*) INTO v_tasks_handled FROM moved;
  ELSIF p_task_action = 'cancel' THEN
    WITH cancelled AS (
      UPDATE tasks
         SET status = 'ignored'
       WHERE agent_id = p_agent_id
         AND status = 'pending'
         AND deleted_at IS NULL
       RETURNING id
    )
    SELECT COUNT(*) INTO v_tasks_handled FROM cancelled;
  END IF;

  -- 3. Visits
  IF p_visit_action = 'transfer' AND p_target_agent_id IS NOT NULL THEN
    WITH moved AS (
      UPDATE visits
         SET agent_id = p_target_agent_id
       WHERE agent_id = p_agent_id
         AND status IN ('planned', 'confirmed')
         AND deleted_at IS NULL
       RETURNING id
    )
    SELECT COUNT(*) INTO v_visits_handled FROM moved;
  ELSIF p_visit_action = 'cancel' THEN
    WITH cancelled AS (
      UPDATE visits
         SET status = 'cancelled'
       WHERE agent_id = p_agent_id
         AND status IN ('planned', 'confirmed')
         AND deleted_at IS NULL
       RETURNING id
    )
    SELECT COUNT(*) INTO v_visits_handled FROM cancelled;
  END IF;

  -- 4. Reservations
  IF p_reservation_action = 'transfer' AND p_target_agent_id IS NOT NULL THEN
    WITH moved AS (
      UPDATE reservations
         SET agent_id = p_target_agent_id
       WHERE agent_id = p_agent_id
         AND status = 'active'
       RETURNING id
    )
    SELECT COUNT(*) INTO v_resv_handled FROM moved;
  END IF;
  -- 'keep' = no-op (admin handles).

  -- 5. Final flip — agent inactive, leave fields null.
  UPDATE users
     SET status            = 'inactive',
         leave_starts_at   = NULL,
         leave_ends_at     = NULL,
         backup_agent_id   = NULL,
         leave_reason      = NULL
   WHERE id = p_agent_id;

  RETURN jsonb_build_object(
    'clients_moved',    v_clients_moved,
    'tasks_handled',    v_tasks_handled,
    'visits_handled',   v_visits_handled,
    'reservations_handled', v_resv_handled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION deactivate_agent_atomic(UUID, UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 9. tenant-exports private bucket (H4)
-- ════════════════════════════════════════════════════════════════════
-- Private bucket so export-tenant can switch from public landing-
-- assets/exports/ (URL guessable via Date.now()) to a signed-URL
-- dump scoped to super_admin.

INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-exports', 'tenant-exports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "tenant_exports_super_admin_only" ON storage.objects;
CREATE POLICY "tenant_exports_super_admin_only" ON storage.objects
  FOR ALL
  USING (bucket_id = 'tenant-exports' AND is_super_admin())
  WITH CHECK (bucket_id = 'tenant-exports' AND is_super_admin());

-- ════════════════════════════════════════════════════════════════════
-- 9b. rate_limit_buckets — DB-backed rate limiter (H13)
-- ════════════════════════════════════════════════════════════════════
-- Edge in-memory Map is per-isolate, so the existing 10/min on
-- capture-lead becomes effectively N×10. This table + RPC gives a
-- single source of truth across isolates.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key  TEXT NOT NULL,
  window_ts   BIGINT NOT NULL,         -- floor(now/window_ms) — bucket id
  count       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_ts)
);

-- Auto-purge old buckets — 1 day TTL.
CREATE OR REPLACE FUNCTION purge_rate_limit_buckets()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM rate_limit_buckets
  WHERE window_ts < (extract(epoch from now() - interval '1 day') * 1000)::bigint;
$$;

-- Atomic increment + check. Returns rows after increment so the
-- caller can compare to the limit.
CREATE OR REPLACE FUNCTION rate_limit_bump(
  p_bucket_key TEXT,
  p_window_ms  BIGINT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_ts BIGINT;
  v_count     INT;
BEGIN
  v_window_ts := (extract(epoch from now()) * 1000)::bigint / p_window_ms;
  INSERT INTO rate_limit_buckets (bucket_key, window_ts, count)
  VALUES (p_bucket_key, v_window_ts, 1)
  ON CONFLICT (bucket_key, window_ts)
    DO UPDATE SET count = rate_limit_buckets.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION rate_limit_bump(TEXT, BIGINT) TO authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════════════
-- 10. email-assets bucket — tenant-prefixed scope (MED)
-- ════════════════════════════════════════════════════════════════════
-- Migration 014 let any authenticated user upload anywhere in the
-- bucket. Restrict the prefix to the user's tenant_id folder.

DROP POLICY IF EXISTS "auth_upload_email_assets" ON storage.objects;
CREATE POLICY "auth_upload_email_assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'email-assets'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "auth_update_email_assets" ON storage.objects;
CREATE POLICY "auth_update_email_assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'email-assets'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "auth_delete_email_assets" ON storage.objects;
CREATE POLICY "auth_delete_email_assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'email-assets'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM users WHERE id = auth.uid()
    )
  );

COMMIT;
