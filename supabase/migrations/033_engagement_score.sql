-- ================================================
-- Migration 033 — engagement_score on clients + cron schedule
--
-- MVP closure plan step D — version simple (rule-based, no ML).
-- Adds 2 columns to `clients` and schedules the recompute Edge
-- Function every 6 hours.
--
-- The score is bounded [0, 100], starts at 50 (neutral), and is
-- recomputed in bulk by the recompute-engagement Edge Function from
-- the following signals (sliding window):
--
--   +20  inbound WhatsApp reply within last 7 days (responsive)
--   +15  per realized visit (status='completed') in last 90 days,
--        capped at +30 (so 2+ visits saturate)
--   -20  no contact (history activity) for >14 days
--   -10  per auto_cancelled task in last 30 days, capped at -30
--
-- The smart ML version (predictive, per-tenant calibration, ~1-2
-- weeks effort) is in 💭 Backlog of ROADMAP — to be reconsidered
-- once we have ~3 months of prod data to train on.
-- ================================================

-- 1. Add columns. Idempotent.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER NOT NULL DEFAULT 50
    CHECK (engagement_score >= 0 AND engagement_score <= 100);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS engagement_updated_at TIMESTAMPTZ;

-- 2. Index for sorting clients by score in the pipeline table view.
CREATE INDEX IF NOT EXISTS idx_clients_engagement_score
  ON clients(tenant_id, engagement_score DESC)
  WHERE deleted_at IS NULL;

-- 3. Bulk-recompute RPC. Called by the Edge Function once per tenant
--    so a slow tenant doesn't block the others. Returns the number
--    of clients updated. SECURITY DEFINER so the function (called
--    via service_role) can update across tenants.
CREATE OR REPLACE FUNCTION recompute_engagement_for_tenant(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  WITH per_client AS (
    SELECT
      c.id,
      -- +20 if any inbound WhatsApp in the last 7 days
      CASE
        WHEN EXISTS (
          SELECT 1 FROM whatsapp_messages wm
           WHERE wm.client_id = c.id
             AND wm.direction = 'inbound'
             AND wm.created_at > NOW() - INTERVAL '7 days'
        ) THEN 20 ELSE 0
      END AS bonus_inbound,
      -- +15 per realized visit (capped at +30) in last 90 days
      LEAST(
        30,
        15 * COALESCE((
          SELECT COUNT(*) FROM visits v
           WHERE v.client_id = c.id
             AND v.status = 'completed'
             AND v.created_at > NOW() - INTERVAL '90 days'
        ), 0)
      ) AS bonus_visits,
      -- -20 if no contact in the last 14 days (history activity OR
      -- inbound message). Falls back to client.created_at when no
      -- history exists yet.
      CASE
        WHEN GREATEST(
          COALESCE((SELECT MAX(created_at) FROM history h WHERE h.client_id = c.id), c.created_at),
          COALESCE((SELECT MAX(created_at) FROM whatsapp_messages wm WHERE wm.client_id = c.id), c.created_at)
        ) < NOW() - INTERVAL '14 days'
        THEN -20 ELSE 0
      END AS penalty_silence,
      -- -10 per auto_cancelled task in last 30 days, capped at -30
      GREATEST(
        -30,
        -10 * COALESCE((
          SELECT COUNT(*) FROM tasks t
           WHERE t.client_id = c.id
             AND t.auto_cancelled = TRUE
             AND t.created_at > NOW() - INTERVAL '30 days'
        ), 0)
      ) AS penalty_cancelled
    FROM clients c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
  ),
  scored AS (
    SELECT
      id,
      LEAST(100, GREATEST(0,
        50 + bonus_inbound + bonus_visits + penalty_silence + penalty_cancelled
      ))::INTEGER AS new_score
    FROM per_client
  ),
  updated AS (
    UPDATE clients c
       SET engagement_score = s.new_score,
           engagement_updated_at = NOW()
      FROM scored s
     WHERE c.id = s.id
       AND (c.engagement_score IS DISTINCT FROM s.new_score
            OR c.engagement_updated_at IS NULL)
    RETURNING c.id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_engagement_for_tenant(UUID) TO service_role;

-- 4. Schedule the recompute Edge Function every 6 hours
--    (00:00, 06:00, 12:00, 18:00 UTC).
SELECT cron.schedule(
  'recompute-engagement-6h',
  '0 */6 * * *',
  $$SELECT call_edge_function('recompute-engagement')$$
);

-- ================================================
-- Verification
-- ================================================
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'clients'
--      AND column_name IN ('engagement_score', 'engagement_updated_at');
--   → 2 rows.
--
--   SELECT jobname, schedule FROM cron.job
--    WHERE jobname = 'recompute-engagement-6h';
--   → 1 row, schedule '0 */6 * * *'.
--
-- Manual trigger (don't wait for the next 6h tick):
--   SELECT call_edge_function('recompute-engagement');
-- Then check the function logs for the per-tenant counts.
--
-- ================================================
-- Rollback
-- ================================================
--   SELECT cron.unschedule('recompute-engagement-6h');
--   ALTER TABLE clients DROP COLUMN IF EXISTS engagement_score;
--   ALTER TABLE clients DROP COLUMN IF EXISTS engagement_updated_at;
--   DROP INDEX IF EXISTS idx_clients_engagement_score;
