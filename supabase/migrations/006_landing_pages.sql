-- ================================================
-- Landing Pages for lead capture + pixel tracking
-- ================================================

CREATE TABLE IF NOT EXISTS landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID REFERENCES projects(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_image_url TEXT,
  accent_color TEXT DEFAULT '#0579DA',
  form_fields JSONB DEFAULT '["full_name", "phone", "email", "budget", "unit_type", "message"]',
  default_agent_id UUID REFERENCES users(id),
  default_source TEXT DEFAULT 'landing_page',
  meta_pixel_id TEXT,
  google_tag_id TEXT,
  tiktok_pixel_id TEXT,
  meta_access_token TEXT,
  meta_test_event_code TEXT,
  google_api_secret TEXT,
  google_measurement_id TEXT,
  tiktok_access_token TEXT,
  custom_head_scripts TEXT DEFAULT '',
  views_count INTEGER DEFAULT 0,
  submissions_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  distribution_mode TEXT DEFAULT 'fixed' CHECK (distribution_mode IN ('fixed', 'round_robin', 'per_agent')),
  last_assigned_agent_idx INTEGER DEFAULT 0,
  CONSTRAINT landing_pages_slug_unique UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_tenant ON landing_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_pages_active ON landing_pages(is_active) WHERE is_active = TRUE;

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_pages_tenant_select') THEN
    CREATE POLICY "landing_pages_tenant_select" ON landing_pages FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_pages_tenant_all') THEN
    CREATE POLICY "landing_pages_tenant_all" ON landing_pages FOR ALL USING (tenant_id = get_my_tenant_id() OR is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_pages_public_read') THEN
    CREATE POLICY "landing_pages_public_read" ON landing_pages FOR SELECT USING (is_active = TRUE);
  END IF;
END $$;
