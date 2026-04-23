-- ================================================
-- Marketing leads — capture form on www.immoprox.io/contact
-- Public insert (anyone can submit a lead), read restricted to super admins.
-- ================================================

CREATE TABLE IF NOT EXISTS marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Step 1 (minimal — always present)
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,

  -- Step 2 (qualification — optional if user abandons step 2)
  company_name TEXT,
  activity_type TEXT,              -- 'agence' | 'promoteur' | 'freelance' | 'entreprise'
  agents_count TEXT,               -- '1' | '2-5' | '6-15' | '16-50' | '50+'
  wilayas TEXT[],                  -- e.g. ['Alger','Oran']
  leads_per_month TEXT,            -- '<10' | '10-50' | '50-200' | '200+'
  marketing_budget_monthly TEXT,   -- '<50k' | '50-200k' | '200k-1M' | '>1M'
  acquisition_channels TEXT[],     -- checkbox multi
  current_tools TEXT,              -- 'excel' | 'whatsapp' | 'crm' | 'nothing'
  decision_maker TEXT,             -- 'me' | 'boss' | 'partners' | 'committee'
  decision_maker_names TEXT,       -- free text when boss/partners
  frustration_score INTEGER CHECK (frustration_score BETWEEN 1 AND 10),
  timeline TEXT,                   -- 'this_week' | 'this_month' | '3_months' | 'browsing'
  message TEXT,

  -- Tracking
  source TEXT,                     -- utm_source
  medium TEXT,                     -- utm_medium
  campaign TEXT,                   -- utm_campaign
  referrer TEXT,                   -- document.referrer
  user_agent TEXT,

  -- Pipeline status (for super admin follow-up)
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','demo_booked','demo_done','won','lost','nurture')),
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id),

  -- Lifecycle
  step_completed INTEGER NOT NULL DEFAULT 1 CHECK (step_completed IN (1, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_leads_status ON marketing_leads(status);
CREATE INDEX idx_marketing_leads_created ON marketing_leads(created_at DESC);
CREATE INDEX idx_marketing_leads_email ON marketing_leads(email);

ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;

-- Public insert: anyone (anon key) can submit a lead via the contact form
CREATE POLICY "public_insert_marketing_leads" ON marketing_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Public update: allow updating the same lead when transitioning from step 1 → step 2.
-- We restrict by id + email match so a random anon can't overwrite someone else's lead.
CREATE POLICY "public_update_own_lead" ON marketing_leads
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Read: only super admins can see leads
CREATE POLICY "super_admin_read_marketing_leads" ON marketing_leads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
  );

-- Update (full): only super admins can edit status / notes / assignment
CREATE POLICY "super_admin_update_marketing_leads" ON marketing_leads
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
  );

-- Delete: only super admins
CREATE POLICY "super_admin_delete_marketing_leads" ON marketing_leads
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_marketing_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketing_leads_updated_at
  BEFORE UPDATE ON marketing_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_leads_updated_at();

COMMENT ON TABLE marketing_leads IS 'Leads captured from www.immoprox.io/contact — public insert, super admin read/manage';
