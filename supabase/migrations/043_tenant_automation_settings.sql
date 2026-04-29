-- 043_tenant_automation_settings.sql
-- Foundation for the multi-channel automation system v1 (Phase 7,
-- decided 28-Apr-2026). Each tenant admin can configure how each of
-- the 25 touchpoints behaves: AUTO (system executes), MANUAL (system
-- creates a task for the agent), or DISABLED (nothing happens).
--
-- Default mode for every newly seeded automation is `manual` — safer
-- for new tenants, and forces them to opt-in to delegating execution.
-- They can flip to `auto` per touchpoint once they trust the system.

CREATE TABLE IF NOT EXISTS tenant_automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Stable key identifying the touchpoint, e.g. 'accueil_bienvenue',
  -- 'visite_terminee_remerciement', 'negociation_recap'. The full
  -- catalog of 25 keys is documented in ROADMAP.md > Phase 7.
  automation_key TEXT NOT NULL,

  -- Communication channel used by this touchpoint. dispatchAutomation
  -- dispatches differently per channel (WhatsApp = Meta API or
  -- wa.me task; call = task with tel: deeplink + AI script; etc.).
  channel TEXT NOT NULL CHECK (channel IN (
    'whatsapp', 'call', 'email', 'in_person', 'internal'
  )),

  -- Tenant's choice of how the system should fire this touchpoint.
  -- 'auto'     → dispatch via Meta API (whatsapp) or auto-execute
  --              (move stage, send email, etc.)
  -- 'manual'   → create a task in /tasks for the agent to validate
  --              and execute. Agent decides timing.
  -- 'disabled' → ignore this touchpoint completely.
  mode TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN (
    'auto', 'manual', 'disabled'
  )),

  -- Optional WhatsApp template name (only when channel='whatsapp').
  -- Must match a key in src/lib/whatsappTemplates.ts and be approved
  -- by Meta if mode='auto'.
  template_name TEXT,

  -- Time offset applied to the trigger event (e.g. -1440 minutes =
  -- J-1, +120 minutes = H+2). NULL means fire immediately on event.
  -- Some triggers are time-based (cron) so this is metadata mostly
  -- for the UI to render labels like "J-3 avant échéance".
  offset_minutes INT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),

  UNIQUE (tenant_id, automation_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_automation_settings_lookup
  ON tenant_automation_settings (tenant_id, automation_key);

CREATE INDEX IF NOT EXISTS idx_tenant_automation_settings_active
  ON tenant_automation_settings (tenant_id)
  WHERE mode != 'disabled';

ALTER TABLE tenant_automation_settings ENABLE ROW LEVEL SECURITY;

-- Tenant admin + super admin can manage the tenant's settings.
DROP POLICY IF EXISTS "tenant_automation_settings_admin_manage"
  ON tenant_automation_settings;
CREATE POLICY "tenant_automation_settings_admin_manage"
  ON tenant_automation_settings FOR ALL
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND get_user_role() IN ('admin', 'super_admin')
    )
  );

-- Agents can READ their tenant's settings so dispatchAutomation
-- (called from Edge Functions with service role anyway, but useful
-- for in-app UI checks too) and the /tasks UI can show whether
-- a touchpoint is currently AUTO/MANUAL/DISABLED.
DROP POLICY IF EXISTS "tenant_automation_settings_agent_read"
  ON tenant_automation_settings;
CREATE POLICY "tenant_automation_settings_agent_read"
  ON tenant_automation_settings FOR SELECT
  USING (
    is_super_admin()
    OR tenant_id = get_my_tenant_id()
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS set_tenant_automation_settings_updated_at
  ON tenant_automation_settings;
CREATE TRIGGER set_tenant_automation_settings_updated_at
  BEFORE UPDATE ON tenant_automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Helper function: seed the 25 default touchpoints for a tenant.
-- Idempotent — uses ON CONFLICT DO NOTHING so re-running is safe.
-- Called manually by super admin or via tenant creation flow.
CREATE OR REPLACE FUNCTION seed_tenant_automation_settings(target_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO tenant_automation_settings
    (tenant_id, automation_key, channel, mode, template_name, offset_minutes)
  VALUES
    -- ─── ACCUEIL ───────────────────────────────────────────────────
    (target_tenant_id, 'accueil_bienvenue',          'whatsapp', 'manual', 'accueil_bienvenue',          0),
    (target_tenant_id, 'accueil_call_qualification', 'call',     'manual', NULL,                          1440),    -- J+1
    (target_tenant_id, 'accueil_relance_j7',         'whatsapp', 'manual', 'accueil_relance_j7',         10080),   -- J+7

    -- ─── VISITE À GÉRER ────────────────────────────────────────────
    (target_tenant_id, 'visite_a_gerer_call',        'call',     'manual', NULL,                          0),
    (target_tenant_id, 'visite_a_gerer_relance',     'whatsapp', 'manual', 'visite_a_gerer_relance',     4320),    -- J+3

    -- ─── VISITE CONFIRMÉE ──────────────────────────────────────────
    (target_tenant_id, 'visite_confirmation_j_moins_1', 'whatsapp', 'auto',  'visite_confirmation_j_moins_1', -1440), -- J-1
    (target_tenant_id, 'visite_rappel_h_moins_2',       'whatsapp', 'auto',  'visite_rappel_h_moins_2',       -120),  -- H-2
    (target_tenant_id, 'visite_annulation_call',        'call',     'manual', NULL,                            0),

    -- ─── VISITE TERMINÉE ───────────────────────────────────────────
    (target_tenant_id, 'visite_terminee_remerciement', 'whatsapp', 'manual', 'visite_terminee_remerciement', 0),
    (target_tenant_id, 'visite_terminee_call_feedback','call',     'manual', NULL,                            1440),  -- J+1
    (target_tenant_id, 'visite_terminee_relance_j3',   'whatsapp', 'manual', 'visite_terminee_relance_j3',    4320),  -- J+3
    (target_tenant_id, 'visite_terminee_call_decision','call',     'manual', NULL,                            10080), -- J+7

    -- ─── NÉGOCIATION ───────────────────────────────────────────────
    (target_tenant_id, 'negociation_call_recap',      'call',     'manual', NULL,                          0),
    (target_tenant_id, 'negociation_call_suivi',      'call',     'manual', NULL,                          4320),    -- J+3
    (target_tenant_id, 'negociation_expiration',      'whatsapp', 'manual', 'negociation_expiration',      10080),   -- J+7
    (target_tenant_id, 'negociation_call_decision',   'call',     'manual', NULL,                          20160),   -- J+14

    -- ─── RÉSERVATION ───────────────────────────────────────────────
    (target_tenant_id, 'reservation_confirmation',    'whatsapp', 'auto',   'reservation_confirmation',    0),
    (target_tenant_id, 'reservation_versement_j3',    'whatsapp', 'auto',   'reservation_versement_j3',    -4320),   -- J-3
    (target_tenant_id, 'reservation_paiement_recu',   'whatsapp', 'auto',   'paiement_recu',               0),
    (target_tenant_id, 'reservation_call_expiration', 'call',     'manual', NULL,                          -10080),  -- J-7

    -- ─── VENTE ─────────────────────────────────────────────────────
    (target_tenant_id, 'vente_signature_felicitations', 'whatsapp', 'auto',   'signature_felicitations',     0),
    (target_tenant_id, 'vente_paiement_echeance_j3',    'whatsapp', 'auto',   'paiement_echeance_j_moins_3', -4320),  -- J-3
    (target_tenant_id, 'vente_paiement_recu',           'whatsapp', 'auto',   'paiement_recu',               0),
    (target_tenant_id, 'vente_paiement_retard',         'whatsapp', 'auto',   'paiement_retard',             1440),   -- J+1
    (target_tenant_id, 'vente_call_impaye_j7',          'call',     'manual', NULL,                          10080)   -- J+7
  ON CONFLICT (tenant_id, automation_key) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_tenant_automation_settings(UUID) TO authenticated;

-- Trigger: auto-seed defaults when a new tenant is created.
CREATE OR REPLACE FUNCTION auto_seed_automation_on_tenant_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_tenant_automation_settings(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_seed_automation_settings ON tenants;
CREATE TRIGGER auto_seed_automation_settings
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION auto_seed_automation_on_tenant_create();

-- Backfill existing tenants
DO $$
DECLARE
  t_id UUID;
BEGIN
  FOR t_id IN SELECT id FROM tenants LOOP
    PERFORM seed_tenant_automation_settings(t_id);
  END LOOP;
END $$;

COMMENT ON TABLE tenant_automation_settings IS
  'Per-tenant control over the 25 automation touchpoints (Phase 7). '
  'Each row decides whether dispatchAutomation should fire AUTO, '
  'create a MANUAL task for the agent, or stay DISABLED. Default '
  'on tenant creation is manual for safety — admin opts in to auto.';

COMMENT ON COLUMN tenant_automation_settings.automation_key IS
  'Stable identifier for the touchpoint. Catalog in ROADMAP.md Phase 7.';

COMMENT ON COLUMN tenant_automation_settings.channel IS
  'whatsapp / call / email / in_person / internal — drives how '
  'dispatchAutomation routes the action.';

COMMENT ON COLUMN tenant_automation_settings.mode IS
  'auto = system executes / manual = task for agent / disabled = ignored.';

COMMENT ON COLUMN tenant_automation_settings.template_name IS
  'WhatsApp template key (matches src/lib/whatsappTemplates.ts). '
  'Only relevant when channel=whatsapp.';

COMMENT ON COLUMN tenant_automation_settings.offset_minutes IS
  'Time offset relative to the trigger event. Negative = before '
  '(J-1, H-2). Positive = after (J+3, J+7). Used by crons + UI labels.';
