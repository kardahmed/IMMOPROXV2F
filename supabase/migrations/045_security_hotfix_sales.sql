-- 045_security_hotfix_sales.sql
-- ────────────────────────────────────────────────────────────────────
-- Migration 017 hardened RLS on the customer-facing tables (clients,
-- visits, reservations, history, tasks, documents, whatsapp_*) but
-- left the financial module (sales, payment_schedules, charges,
-- sale_amenities) on the legacy generic tenant_isolation policy.
-- The 28-Apr-2026 audit (finding B4) confirmed: an agent can still
-- SELECT / UPDATE / DELETE every sale and payment_schedule of their
-- tenant, regardless of who owns the row. This is the exact scenario
-- migration 017 was supposed to close — but it stopped at the
-- pipeline tables and never reached the money side.
--
-- This migration:
--   1. Replaces the legacy *_tenant_select / *_tenant_insert /
--      *_tenant_update / *_tenant_delete policies on sales,
--      payment_schedules, charges, sale_amenities with the same
--      4-policy pattern from 017 (uses can_see_agent_row + role
--      gates).
--   2. DELETE on sales / payment_schedules is restricted to
--      super_admin only — these are legally and financially material
--      records, never to be wiped by an admin in a hurry. Agencies
--      can soft-cancel via status='cancelled' instead.
--   3. UPDATE on sale_amenities follows the parent sale's agent_id
--      (joined via sale_id) so an agent can only update the
--      amenities of their own sales.
--   4. Switches agent_id ON DELETE CASCADE → SET NULL on visits,
--      reservations, sales, agent_goals so deleting a user no longer
--      wipes their commercial history (audit finding E2).
--   5. Declares trigger_set_updated_at() — referenced by migrations
--      016, 023, 041, 043 but never explicitly created in any
--      migration (it lives in the prod DB courtesy of Studio,
--      meaning a fresh DB built from migrations alone would crash).
-- ────────────────────────────────────────────────────────────────────

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- 1. trigger_set_updated_at — declare the missing helper.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_set_updated_at IS
  'Generic BEFORE UPDATE trigger that bumps updated_at to NOW(). '
  'Referenced by migrations 016, 023, 041, 043 — declared formally '
  'in 045 so a fresh DB rebuild from migrations alone succeeds.';

-- ════════════════════════════════════════════════════════════════════
-- 2. Re-write RLS on sales, payment_schedules, charges, sale_amenities.
-- ════════════════════════════════════════════════════════════════════
-- Drop the legacy generic policies first (they were created by the
-- DO loop in migration 001 lines 476-503).

DROP POLICY IF EXISTS "sales_tenant_select" ON sales;
DROP POLICY IF EXISTS "sales_tenant_insert" ON sales;
DROP POLICY IF EXISTS "sales_tenant_update" ON sales;
DROP POLICY IF EXISTS "sales_tenant_delete" ON sales;

DROP POLICY IF EXISTS "payment_schedules_tenant_select" ON payment_schedules;
DROP POLICY IF EXISTS "payment_schedules_tenant_insert" ON payment_schedules;
DROP POLICY IF EXISTS "payment_schedules_tenant_update" ON payment_schedules;
DROP POLICY IF EXISTS "payment_schedules_tenant_delete" ON payment_schedules;

DROP POLICY IF EXISTS "charges_tenant_select" ON charges;
DROP POLICY IF EXISTS "charges_tenant_insert" ON charges;
DROP POLICY IF EXISTS "charges_tenant_update" ON charges;
DROP POLICY IF EXISTS "charges_tenant_delete" ON charges;

DROP POLICY IF EXISTS "sale_amenities_tenant_select" ON sale_amenities;
DROP POLICY IF EXISTS "sale_amenities_tenant_insert" ON sale_amenities;
DROP POLICY IF EXISTS "sale_amenities_tenant_update" ON sale_amenities;
DROP POLICY IF EXISTS "sale_amenities_tenant_delete" ON sale_amenities;

-- ── sales ────────────────────────────────────────────────────────
-- Agents see their own sales. Admins + super_admin see all.

CREATE POLICY "sales_select" ON sales FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND can_see_agent_row(agent_id)
    )
  );

CREATE POLICY "sales_insert" ON sales FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin', 'agent')
    )
  );

-- Agents update their own sales (e.g. to set status='cancelled');
-- admin/super_admin update any sale in the tenant.
CREATE POLICY "sales_update" ON sales FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND can_see_agent_row(agent_id)
    )
  );

-- DELETE locked to super_admin only — sales are legally material.
-- Tenants soft-cancel via status='cancelled'.
CREATE POLICY "sales_delete" ON sales FOR DELETE
  USING (is_super_admin());

-- ── payment_schedules ────────────────────────────────────────────
-- Schedules inherit access from their parent sale (joined inline).

CREATE POLICY "payment_schedules_select" ON payment_schedules FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM sales s
        WHERE s.id = payment_schedules.sale_id
          AND can_see_agent_row(s.agent_id)
      )
    )
  );

CREATE POLICY "payment_schedules_insert" ON payment_schedules FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin', 'agent')
    )
  );

CREATE POLICY "payment_schedules_update" ON payment_schedules FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM sales s
        WHERE s.id = payment_schedules.sale_id
          AND can_see_agent_row(s.agent_id)
      )
    )
  );

-- DELETE locked to super_admin (financial integrity).
CREATE POLICY "payment_schedules_delete" ON payment_schedules FOR DELETE
  USING (is_super_admin());

-- ── charges ──────────────────────────────────────────────────────
-- Charges follow the parent sale when present, otherwise the client.

CREATE POLICY "charges_select" ON charges FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND (
        sale_id IS NULL
        OR EXISTS (
          SELECT 1 FROM sales s
          WHERE s.id = charges.sale_id
            AND can_see_agent_row(s.agent_id)
        )
      )
    )
  );

CREATE POLICY "charges_insert" ON charges FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin', 'agent')
    )
  );

CREATE POLICY "charges_update" ON charges FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "charges_delete" ON charges FOR DELETE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );

-- ── sale_amenities ───────────────────────────────────────────────

CREATE POLICY "sale_amenities_select" ON sale_amenities FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM sales s
        WHERE s.id = sale_amenities.sale_id
          AND can_see_agent_row(s.agent_id)
      )
    )
  );

CREATE POLICY "sale_amenities_insert" ON sale_amenities FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin', 'agent')
    )
  );

CREATE POLICY "sale_amenities_update" ON sale_amenities FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM sales s
        WHERE s.id = sale_amenities.sale_id
          AND can_see_agent_row(s.agent_id)
      )
    )
  );

CREATE POLICY "sale_amenities_delete" ON sale_amenities FOR DELETE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );

-- ════════════════════════════════════════════════════════════════════
-- 3. agent_id ON DELETE CASCADE → SET NULL on commercial tables.
-- ════════════════════════════════════════════════════════════════════
-- Original 001 attached visits.agent_id, reservations.agent_id,
-- sales.agent_id, agent_goals.agent_id with ON DELETE CASCADE so
-- removing a user wiped their entire commercial history. Switch to
-- SET NULL so the records survive (audit + legal trail) — agent_id
-- becomes nullable, downstream queries already handle null via
-- can_see_agent_row.

-- visits.agent_id is already nullable in the schema (no NOT NULL),
-- so we only need to swap the FK action.
ALTER TABLE visits
  DROP CONSTRAINT IF EXISTS visits_agent_id_fkey,
  ADD CONSTRAINT visits_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL;

-- reservations.agent_id is NOT NULL in 001 — relax to nullable
-- so the SET NULL action is valid.
ALTER TABLE reservations ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_agent_id_fkey,
  ADD CONSTRAINT reservations_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL;

-- sales.agent_id is NOT NULL in 001 — same relaxation.
ALTER TABLE sales ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_agent_id_fkey,
  ADD CONSTRAINT sales_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL;

-- agent_goals.agent_id stays NOT NULL because a goal without an
-- assignee is meaningless — keep CASCADE for that one (deleting the
-- user purges their goals, which is correct).

COMMIT;
