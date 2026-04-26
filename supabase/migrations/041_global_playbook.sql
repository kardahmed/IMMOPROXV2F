-- 041_global_playbook.sql
-- Replace per-tenant sale_playbooks with a single platform-wide global playbook.
-- Founder writes ONE free-form system_prompt in /admin/playbook → injected into every
-- AI prompt across the platform (call scripts, lead suggestions, future AI features).
-- Per-tenant configuration is removed (sales-led model — founder owns the brain).

CREATE TABLE IF NOT EXISTS global_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_prompt TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  singleton BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT global_playbook_singleton_unique UNIQUE (singleton)
);

-- Seed the single row (the singleton constraint ensures only one ever exists).
INSERT INTO global_playbook (system_prompt, singleton)
VALUES ('', true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE global_playbook ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (Edge Functions use service role and bypass RLS,
-- but tenant-side React Query reads happen with the user's JWT, e.g. if we
-- later show a read-only banner). Keep it simple: authenticated can read.
CREATE POLICY "global_playbook_read_authenticated"
  ON global_playbook FOR SELECT
  TO authenticated
  USING (true);

-- Write: super_admin only.
CREATE POLICY "global_playbook_write_super_admin"
  ON global_playbook FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_global_playbook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS global_playbook_updated_at ON global_playbook;
CREATE TRIGGER global_playbook_updated_at
  BEFORE UPDATE ON global_playbook
  FOR EACH ROW
  EXECUTE FUNCTION set_global_playbook_updated_at();

-- Wipe per-tenant playbooks. The founder owns the playbook now — there is no
-- per-tenant override path until/unless an Enterprise tenant explicitly buys it.
DROP TABLE IF EXISTS sale_playbooks CASCADE;
