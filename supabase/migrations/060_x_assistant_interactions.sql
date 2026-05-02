-- ============================================================================
-- 060_x_assistant_interactions.sql
--
-- Phase 1 of the X assistant. Captures every Q&A interaction so we can:
--   - audit what users ask X (founder review during alpha)
--   - track per-tenant cost (tokens × DA rate from feature_catalog)
--   - rate-limit at the agent level (max questions/day) without
--     calling the Anthropic API every time
--   - power the future "X conversation history" UI panel
--
-- All times in UTC. Costs in DA at 250 DA/USD parallel rate.
-- Phase 2 (tool execution) will add `actions_executed jsonb` and an
-- `action_status` column on this same table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS x_interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 'question' for now (Phase 1). Phase 2 adds 'action', 'multi_step'.
  type            TEXT NOT NULL DEFAULT 'question',
  -- The user's input. NULL until we capture voice → text in v2.
  input_text      TEXT NOT NULL,
  -- Claude's response.
  response_text   TEXT,
  -- Claude usage stats. We sum these to bill the tenant against their
  -- monthly quota_x_questions_monthly cap (added in plan_limits later
  -- if we want hard caps; currently only soft via feature flag).
  input_tokens    INT DEFAULT 0,
  output_tokens   INT DEFAULT 0,
  cost_da         NUMERIC(8, 4) DEFAULT 0,
  -- End-to-end latency in ms (for SLA monitoring).
  duration_ms     INT,
  -- Was the model call successful end-to-end?
  success         BOOLEAN NOT NULL DEFAULT TRUE,
  error_msg       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_x_interactions_tenant_at
  ON x_interactions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_x_interactions_user_at
  ON x_interactions(user_id, created_at DESC);

ALTER TABLE x_interactions ENABLE ROW LEVEL SECURITY;

-- Anyone in the tenant can SELECT their own + the rest of their tenant's
-- interactions (admin can audit, agent can see their own history).
DROP POLICY IF EXISTS x_interactions_select_tenant ON x_interactions;
CREATE POLICY x_interactions_select_tenant ON x_interactions
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Inserts only happen via the service-role-key from the edge function.
-- Block direct browser inserts (otherwise an agent could fake a row
-- to skew their cost counter).
DROP POLICY IF EXISTS x_interactions_insert_service_only ON x_interactions;
CREATE POLICY x_interactions_insert_service_only ON x_interactions
  FOR INSERT
  WITH CHECK (false);  -- service role bypasses RLS, so this is "no client inserts ever"

-- Super-admin can read across tenants (already implicit via service
-- role, but make it explicit for the dashboard query).
DROP POLICY IF EXISTS x_interactions_select_super_admin ON x_interactions;
CREATE POLICY x_interactions_select_super_admin ON x_interactions
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

-- ────────────────────────────────────────────────────────────────────
-- Helper: per-tenant usage rollup for the current month.
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION x_usage_this_month(p_tenant_id UUID)
RETURNS TABLE (
  questions_count INT,
  cost_da_total   NUMERIC,
  tokens_total    INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::INT                                                AS questions_count,
    COALESCE(SUM(cost_da), 0)::NUMERIC                           AS cost_da_total,
    COALESCE(SUM(input_tokens + output_tokens), 0)::INT          AS tokens_total
  FROM x_interactions
  WHERE tenant_id = p_tenant_id
    AND success = TRUE
    AND created_at >= date_trunc('month', NOW());
$$;

NOTIFY pgrst, 'reload schema';
