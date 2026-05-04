-- ════════════════════════════════════════════════════════════════════
-- 066 — Public view exposing tenant pixel IDs (no secrets)
-- ════════════════════════════════════════════════════════════════════
-- Public landing pages need to inject the tenant's Meta / Google /
-- TikTok pixel scripts into the visitor's browser. Visitors are
-- unauthenticated, so they hit the schema as the `anon` role —
-- which has no read access to `tenant_integrations` (good — that
-- table holds api_keys for Resend etc.).
--
-- Pixel IDs themselves are NOT secrets: they're embedded in the page
-- HTML as soon as the script runs, and Meta's docs explicitly call
-- them public identifiers. So we expose ONLY the non-secret pieces
-- (pixel_id, measurement_id, tracking_id) via a dedicated public
-- view, and leave api_key / access_token in the locked-down base
-- table.
--
-- security_invoker = true would be ideal but the base table's RLS
-- blocks anon, so we make this a SECURITY DEFINER view with explicit
-- column whitelist instead.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW tenant_pixels_public AS
SELECT
  ti.tenant_id,
  ti.type,
  -- Whitelisted pixel-id-like fields. Any future field added to
  -- config that's NOT one of these will not be exposed. New non-secret
  -- IDs (e.g. linkedin_partner_id) need an explicit COALESCE entry.
  ti.config->>'pixel_id'       AS pixel_id,
  ti.config->>'measurement_id' AS measurement_id,
  ti.config->>'tracking_id'    AS tracking_id
FROM tenant_integrations ti
WHERE ti.type IN ('meta_pixel', 'google_analytics', 'tiktok_pixel')
  AND ti.enabled = TRUE;

COMMENT ON VIEW tenant_pixels_public IS
  'Public-safe pixel IDs only. Used by /p/:slug landing pages to inject the tenant default pixels when a landing-page-level override is not set. NEVER add columns that touch api_key or any secret config.';

-- Anon = unauthenticated visitors of public landing pages.
GRANT SELECT ON tenant_pixels_public TO anon, authenticated;

-- Make sure the view bypasses RLS on the underlying table —
-- visitors don't have permission to SELECT from tenant_integrations
-- but they're allowed to read this curated view.
ALTER VIEW tenant_pixels_public SET (security_invoker = false);
