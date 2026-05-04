-- ════════════════════════════════════════════════════════════════════
-- 068 — Vague 1A: atomic notes append + plan-quota enforcement
-- ════════════════════════════════════════════════════════════════════
-- Two SQL-side hardening fixes from the brutal audit:
--
--   1.5 — clients.notes was being mutated read-modify-write from the
--         frontend (src/lib/clientNotes.ts), so two simultaneous calls
--         (e.g. an agent changing the stage at the same moment as a
--         WhatsApp send) clobbered each other and lost notes. Replace
--         the pattern with a SECURITY INVOKER RPC that does a single
--         UPDATE statement; Postgres MVCC + the row-level write lock
--         on clients makes the append fully atomic.
--
--   1.6 — sales / reservations / units inserts originate from the
--         browser. The frontend has no quota gate (`max_units`,
--         `max_clients` only enforced visually). RLS lets the row
--         through. Add BEFORE INSERT triggers on the affected tables
--         that count current rows for the tenant against the plan
--         and RAISE EXCEPTION when over. Free plan / -1 limit means
--         unlimited.
-- ════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1.5 — append_note(client_id, note_text) RPC
-- ──────────────────────────────────────────────────────────────────
-- SECURITY INVOKER so RLS on `clients` applies — agent can only
-- append to clients in their tenant. Returns the new full notes blob
-- so the caller can refresh its UI without a second roundtrip.
CREATE OR REPLACE FUNCTION append_client_note(
  p_client_id UUID,
  p_note      TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result TEXT;
BEGIN
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    -- No-op: don't write empty notes.
    SELECT notes INTO result FROM clients WHERE id = p_client_id;
    RETURN result;
  END IF;

  -- The existing helper in src/lib/clientNotes.ts PREPENDS so that
  -- the Notes tab shows newest entries at the top. Mirror that here:
  -- the new note lands above the previous text. (clients table has
  -- only created_at — no updated_at column to bump.)
  UPDATE clients
  SET notes = CASE
    WHEN notes IS NULL OR length(trim(notes)) = 0
      THEN p_note
    ELSE p_note || E'\n\n' || notes
  END
  WHERE id = p_client_id
  RETURNING notes INTO result;

  -- If RLS hid the row OR the id was bogus, no row was updated.
  -- The caller passed in something they don't own; silently no-op.
  -- A returning NULL here is enough signal.
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION append_client_note(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_client_note(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION append_client_note(UUID, TEXT) IS
  'Atomically appends to clients.notes, replacing the broken read-modify-write pattern in src/lib/clientNotes.ts. SECURITY INVOKER → RLS on clients applies → agents can only append to clients in their tenant.';

-- ──────────────────────────────────────────────────────────────────
-- 1.6a — enforce max_units per tenant plan
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_units_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- needs to read plan_limits which is gated to authenticated
SET search_path = public
AS $$
DECLARE
  v_current_count INTEGER;
  v_max_allowed   INTEGER;
  v_plan          TEXT;
BEGIN
  -- Look up tenant plan + cap
  SELECT t.plan INTO v_plan
  FROM tenants t WHERE t.id = NEW.tenant_id;

  IF v_plan IS NULL THEN
    -- No tenant row → let the FK violation handle it
    RETURN NEW;
  END IF;

  SELECT pl.max_units INTO v_max_allowed
  FROM plan_limits pl WHERE pl.plan = v_plan;

  -- -1 (or NULL) → unlimited
  IF v_max_allowed IS NULL OR v_max_allowed < 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM units WHERE tenant_id = NEW.tenant_id;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Plan quota exceeded: % units allowed for plan %, you have % already',
      v_max_allowed, v_plan, v_current_count
      USING
        ERRCODE = 'P0001',
        HINT    = 'Upgrade the tenant plan to add more units';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS units_quota_check ON units;
CREATE TRIGGER units_quota_check
  BEFORE INSERT ON units
  FOR EACH ROW EXECUTE FUNCTION enforce_units_quota();

-- ──────────────────────────────────────────────────────────────────
-- 1.6b — enforce max_clients per tenant plan
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_clients_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_count INTEGER;
  v_max_allowed   INTEGER;
  v_plan          TEXT;
BEGIN
  SELECT t.plan INTO v_plan
  FROM tenants t WHERE t.id = NEW.tenant_id;

  IF v_plan IS NULL THEN RETURN NEW; END IF;

  SELECT pl.max_clients INTO v_max_allowed
  FROM plan_limits pl WHERE pl.plan = v_plan;

  IF v_max_allowed IS NULL OR v_max_allowed < 0 THEN
    RETURN NEW;
  END IF;

  -- Soft-deleted clients don't count against the quota
  SELECT COUNT(*) INTO v_current_count
  FROM clients
  WHERE tenant_id = NEW.tenant_id
    AND deleted_at IS NULL;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Plan quota exceeded: % clients allowed for plan %, you have % already',
      v_max_allowed, v_plan, v_current_count
      USING
        ERRCODE = 'P0001',
        HINT    = 'Upgrade the tenant plan or archive old clients';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_quota_check ON clients;
CREATE TRIGGER clients_quota_check
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION enforce_clients_quota();

-- ──────────────────────────────────────────────────────────────────
-- 1.6c — enforce max_projects per tenant plan
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_projects_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_count INTEGER;
  v_max_allowed   INTEGER;
  v_plan          TEXT;
BEGIN
  SELECT t.plan INTO v_plan
  FROM tenants t WHERE t.id = NEW.tenant_id;

  IF v_plan IS NULL THEN RETURN NEW; END IF;

  SELECT pl.max_projects INTO v_max_allowed
  FROM plan_limits pl WHERE pl.plan = v_plan;

  IF v_max_allowed IS NULL OR v_max_allowed < 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM projects WHERE tenant_id = NEW.tenant_id;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Plan quota exceeded: % projects allowed for plan %, you have % already',
      v_max_allowed, v_plan, v_current_count
      USING
        ERRCODE = 'P0001',
        HINT    = 'Upgrade the tenant plan to add more projects';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_quota_check ON projects;
CREATE TRIGGER projects_quota_check
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION enforce_projects_quota();

COMMENT ON FUNCTION enforce_units_quota() IS
  'BEFORE INSERT trigger that enforces plan_limits.max_units per tenant. -1 / NULL means unlimited. Raises P0001 with a clear HINT when exceeded so the frontend can show a toast.';
COMMENT ON FUNCTION enforce_clients_quota() IS
  'Same pattern for max_clients. Soft-deleted clients (deleted_at IS NOT NULL) are excluded from the count.';
COMMENT ON FUNCTION enforce_projects_quota() IS
  'Same pattern for max_projects.';
