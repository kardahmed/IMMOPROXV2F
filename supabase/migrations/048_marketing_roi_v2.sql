-- 048_marketing_roi_v2.sql
-- ────────────────────────────────────────────────────────────────────
-- Phase 8 — Marketing ROI v2.
--
-- Audit findings on /marketing-roi:
--
--   1. Every expense was free-floating: marketing_expenses.campaign_id
--      and project_id were both nullable, with no other categorisation,
--      so an agency could spend 500K DZD on "Community Manager mensuel"
--      and the row had nothing tying it to a return — making ROI math
--      meaningless for orphaned rows.
--
--   2. clients.source is a generic enum (facebook_ads, google_ads…)
--      with no link to a specific marketing_campaigns.id. So when a
--      Facebook lead arrived via the landing page, we knew it came
--      "from Facebook" but not which Facebook campaign earned it.
--      Per-campaign ROI was structurally impossible.
--
--   3. AnalyticsTab.tsx line 78 admits: "Global CPL (no per-source
--      expense tracking)". Every source row showed the same total
--      cost ÷ total leads, which is just the average — useless to
--      decide which channel to scale.
--
-- This migration:
--
--   1. clients.marketing_campaign_id UUID REFERENCES marketing_campaigns
--      ON DELETE SET NULL — direct link from a lead to the campaign
--      that generated it. Set by capture-lead (utm_campaign → tracking
--      code → id) or manually via the client form.
--
--   2. marketing_expenses.scope ENUM ('campaign', 'project_overhead',
--      'agency_overhead') NOT NULL — every expense must declare which
--      bucket it falls into. Backfilled from existing campaign_id /
--      project_id so no rows are lost.
--
--   3. marketing_campaigns.tracking_code TEXT — short slug (e.g.
--      'marina-bay-fb') the landing page passes via utm_campaign so
--      capture-lead can resolve it to the campaign id. Unique per
--      tenant so two tenants can both have 'lancement-2026' without
--      collision.
--
--   4. Index on clients.marketing_campaign_id for the per-campaign
--      analytics aggregations (CampaignsTab + AnalyticsTab).
-- ────────────────────────────────────────────────────────────────────

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- 1. clients.marketing_campaign_id
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS marketing_campaign_id UUID
    REFERENCES marketing_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_marketing_campaign
  ON clients (marketing_campaign_id)
  WHERE marketing_campaign_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN clients.marketing_campaign_id IS
  'Link to the marketing_campaigns row that generated this lead. '
  'Set by capture-lead via utm_campaign tracking_code, or manually '
  'attributed via the client form. Null means the lead came in '
  'organically (referral, walk-in) or pre-dates campaign tracking.';

-- ════════════════════════════════════════════════════════════════════
-- 2. marketing_expenses.scope
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE marketing_expenses
  ADD COLUMN IF NOT EXISTS scope TEXT;

-- Backfill from existing data: campaign_id wins, then project_id,
-- otherwise it's overhead. Done before the NOT NULL + CHECK so we
-- never reject existing rows.
UPDATE marketing_expenses
SET scope = CASE
  WHEN campaign_id IS NOT NULL THEN 'campaign'
  WHEN project_id IS NOT NULL THEN 'project_overhead'
  ELSE 'agency_overhead'
END
WHERE scope IS NULL;

ALTER TABLE marketing_expenses
  ALTER COLUMN scope SET NOT NULL,
  ALTER COLUMN scope SET DEFAULT 'agency_overhead';

ALTER TABLE marketing_expenses
  DROP CONSTRAINT IF EXISTS marketing_expenses_scope_check;

ALTER TABLE marketing_expenses
  ADD CONSTRAINT marketing_expenses_scope_check
    CHECK (scope IN ('campaign', 'project_overhead', 'agency_overhead'));

-- Logical-integrity guard: scope='campaign' requires campaign_id,
-- scope='project_overhead' requires project_id. agency_overhead has
-- no constraint — by definition it sits above any specific campaign
-- or project.
ALTER TABLE marketing_expenses
  DROP CONSTRAINT IF EXISTS marketing_expenses_scope_link_check;

ALTER TABLE marketing_expenses
  ADD CONSTRAINT marketing_expenses_scope_link_check
    CHECK (
      (scope = 'campaign'         AND campaign_id IS NOT NULL) OR
      (scope = 'project_overhead' AND project_id IS NOT NULL)  OR
      (scope = 'agency_overhead')
    );

COMMENT ON COLUMN marketing_expenses.scope IS
  'Bucket the expense lands in for ROI math: '
  '"campaign" → tied to one marketing_campaigns row (most ad spend), '
  '"project_overhead" → tied to a project but not a specific campaign '
  '(e.g. drone shoot for stock footage of Marina Bay), '
  '"agency_overhead" → cross-everything (Community Manager monthly '
  'retainer, SEO setup, hosting). Forces every row into a meaningful '
  'category so AnalyticsTab can split ROI per campaign vs ROI per '
  'project vs absorbed overhead.';

-- ════════════════════════════════════════════════════════════════════
-- 3. marketing_campaigns.tracking_code
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS tracking_code TEXT;

-- Unique per tenant — two tenants can both run 'lancement-2026'.
DROP INDEX IF EXISTS idx_marketing_campaigns_tracking_code;
CREATE UNIQUE INDEX idx_marketing_campaigns_tracking_code
  ON marketing_campaigns (tenant_id, lower(tracking_code))
  WHERE tracking_code IS NOT NULL;

COMMENT ON COLUMN marketing_campaigns.tracking_code IS
  'Short slug (e.g. "marina-bay-fb") embedded in landing page URLs '
  'as ?utm_campaign=marina-bay-fb. capture-lead resolves it to this '
  'campaign id and writes clients.marketing_campaign_id, closing '
  'the loop from ad spend to lead to sale.';

COMMIT;
