-- ════════════════════════════════════════════════════════════════════
-- 071 — Pipeline commercial integrity hardening
-- ════════════════════════════════════════════════════════════════════
-- Phase 6 of the pipeline-fixes pass. Two structural guardrails so
-- the frontend can't silently produce ghost-stage clients again
-- even if a future refactor breaks the modal wiring:
--
--   6a) clients.pipeline_stage cannot be set to 'reservation' /
--       'vente' unless the corresponding row exists in the
--       reservations / sales tables. The modals create the row
--       BEFORE flipping the stage, so they pass; a direct UPDATE
--       from the kanban without the modal would now error out.
--
--   6b) reservations(unit_id) is unique while status='active'.
--       Pre-fix two agents could reserve the same unit at the same
--       time — there was no DB-level constraint, the UI never
--       designated which unit was reserved when transitioned via
--       SmartStageDialog, and units.status updates were trigger-
--       based off reservations rows that didn't exist.
-- ════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 6a. Block direct stage move to reservation/vente without backing row
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_commercial_stage_has_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only check on actual stage transitions.
  IF NEW.pipeline_stage IS NOT DISTINCT FROM OLD.pipeline_stage THEN
    RETURN NEW;
  END IF;

  IF NEW.pipeline_stage = 'reservation' THEN
    -- Need at least one active reservation for this client.
    IF NOT EXISTS (
      SELECT 1 FROM reservations
      WHERE client_id = NEW.id
        AND status = 'active'
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot move client to "reservation" without a reservations row. Use the Réservation modal to create one first.'
        USING
          ERRCODE = 'P0001',
          HINT    = 'Open the client → Réservation tab → "+ Créer réservation"';
    END IF;
  ELSIF NEW.pipeline_stage = 'vente' THEN
    -- Need at least one active sale for this client.
    IF NOT EXISTS (
      SELECT 1 FROM sales
      WHERE client_id = NEW.id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Cannot move client to "vente" without a sales row. Use the Vente modal to create one first.'
        USING
          ERRCODE = 'P0001',
          HINT    = 'Open the client → Vente tab → "+ Créer vente"';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_commercial_stage_check ON clients;
CREATE TRIGGER clients_commercial_stage_check
  BEFORE UPDATE OF pipeline_stage ON clients
  FOR EACH ROW
  EXECUTE FUNCTION enforce_commercial_stage_has_row();

COMMENT ON FUNCTION enforce_commercial_stage_has_row() IS
  'Defense-in-depth: refuses pipeline_stage updates to reservation/vente unless the matching reservations/sales row already exists. The frontend modal flow creates the row first, then flips the stage, so legitimate use passes; rogue UPDATEs (or a future refactor regression) get a P0001 with a clear hint.';

-- ──────────────────────────────────────────────────────────────────
-- 6b. Prevent two active reservations on the same unit
-- ──────────────────────────────────────────────────────────────────
-- A unit can have many reservation rows over time (active → expired
-- → re-reserved by another client), but only ONE row may be
-- status='active' at any given moment. Partial unique index does
-- exactly that without blocking historical rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_one_active_per_unit
  ON reservations(unit_id)
  WHERE status = 'active' AND deleted_at IS NULL;

COMMENT ON INDEX idx_reservations_one_active_per_unit IS
  'At most one active reservation per unit. Inserts that would create a second active row error out with a unique violation, surfaced to the user as "Cette unité est déjà réservée".';
