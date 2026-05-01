-- ============================================================================
-- 052_marketing_email_templates.sql
--
-- Creates a tenant-scoped marketing email templates table to replace the use
-- of the (now platform-level) email_templates table for tenant marketing
-- campaigns.
--
-- Background: in production, email_templates was repurposed as a platform-
-- wide slug-based table for transactional emails (password reset, invites)
-- and lost its tenant_id column. Tenant-side marketing templates (drag &
-- drop blocks editor) need their own table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  html_cache TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_tenant
  ON marketing_email_templates(tenant_id);

ALTER TABLE marketing_email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_email_templates_select ON marketing_email_templates;
CREATE POLICY marketing_email_templates_select ON marketing_email_templates
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS marketing_email_templates_admin_write ON marketing_email_templates;
CREATE POLICY marketing_email_templates_admin_write ON marketing_email_templates
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- New FK on email_campaigns pointing at marketing_email_templates.
-- Keep the old `template_id` column intact (legacy) but the frontend
-- will read/write `marketing_template_id` from now on.
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS marketing_template_id UUID
    REFERENCES marketing_email_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_campaigns_marketing_template
  ON email_campaigns(marketing_template_id);

NOTIFY pgrst, 'reload schema';
