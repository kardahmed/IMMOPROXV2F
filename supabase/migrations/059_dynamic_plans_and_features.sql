-- ============================================================================
-- 059_dynamic_plans_and_features.sql
--
-- Sprint A — make the plan + feature system fully dynamic, so the founder
-- can:
--   1. Add a new plan ("team", "agency", etc) without a code change
--   2. Rename an existing plan without breaking front-end checks
--   3. Add/remove features in the catalog from the super-admin UI
--   4. See real cost-per-tenant + margin estimates in DA, recomputed live
--
-- Three changes:
--   A. Drop CHECK constraints that hardcode the plan slugs
--   B. Add a tenants.plan -> plan_limits.plan FK (with ON UPDATE CASCADE so
--      renaming a plan slug propagates), enforcing referential integrity
--      without locking us into a fixed list
--   C. Create feature_catalog table + seed with the current 22 features
--      and their estimated cost in DA at 250 DA/USD parallel rate
--   D. Add cost / margin / trial / sort_order columns to plan_limits
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────
-- A. Drop the hardcoded CHECK constraints
-- ────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  c text;
BEGIN
  -- tenants.plan
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.tenants'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%plan%IN%(%''free''%''starter''%'
  LOOP
    EXECUTE 'ALTER TABLE public.tenants DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;

  -- plan_limits.plan
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.plan_limits'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%plan%IN%(%''free''%''starter''%'
  LOOP
    EXECUTE 'ALTER TABLE public.plan_limits DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- B. Add FK tenants.plan -> plan_limits.plan
--    ON UPDATE CASCADE so a slug rename in plan_limits propagates.
--    ON DELETE RESTRICT so you can't accidentally delete a plan that
--    has tenants on it (forces you to migrate them first).
-- ────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_plan_fkey'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_plan_fkey
      FOREIGN KEY (plan) REFERENCES public.plan_limits(plan)
      ON UPDATE CASCADE ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- C. feature_catalog — single source of truth for what features
--    exist, what they cost us, and how to label them in the UI
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_catalog (
  slug                       TEXT PRIMARY KEY,
  label_fr                   TEXT NOT NULL,
  label_ar                   TEXT NOT NULL,
  category                   TEXT NOT NULL,          -- core | ai | communication | marketing | tools | admin
  icon                       TEXT,                   -- lucide-react icon name (e.g., 'Bot', 'Mail')
  description_fr             TEXT,
  description_ar             TEXT,
  -- Cost we incur per tenant per month at average usage. Stored in
  -- DA at 250 DA/USD (the parallel/black market rate the founder
  -- actually changes USD against). When recomputing pricing, edit
  -- these numbers; nothing else.
  cost_da_monthly_estimated  NUMERIC(10, 2) DEFAULT 0,
  -- Per-use cost — useful for cost projection at heavy usage. Not
  -- charged to tenants, just informational.
  cost_da_per_use            NUMERIC(10, 4) DEFAULT 0,
  -- Toggle off if a feature is in the catalog but not yet implemented.
  -- Hides it from plan editor + plan comparison until ready.
  is_implemented             BOOLEAN NOT NULL DEFAULT TRUE,
  display_order              INT NOT NULL DEFAULT 100,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feature_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_catalog_read_all ON feature_catalog;
CREATE POLICY feature_catalog_read_all ON feature_catalog
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS feature_catalog_admin_write ON feature_catalog;
CREATE POLICY feature_catalog_admin_write ON feature_catalog
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- Auto-bump updated_at
CREATE OR REPLACE FUNCTION feature_catalog_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS feature_catalog_updated_at ON feature_catalog;
CREATE TRIGGER feature_catalog_updated_at
  BEFORE UPDATE ON feature_catalog
  FOR EACH ROW EXECUTE FUNCTION feature_catalog_set_updated_at();

-- ────────────────────────────────────────────────────────────────────
-- D. Extend plan_limits with cost / margin / trial / sort columns
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS estimated_cost_da_monthly NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS gross_margin_pct          NUMERIC(5, 2)  DEFAULT 0;
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS is_trial_eligible         BOOLEAN        DEFAULT FALSE;
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS sort_order                INT            DEFAULT 100;
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS label_fr                  TEXT;
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS label_ar                  TEXT;

-- The 'free' plan is the default trial bucket — set it now so existing
-- TrialBanner/ProtectedRoute logic keeps working as we migrate them off
-- the hardcoded `plan === 'free'` check.
UPDATE plan_limits SET is_trial_eligible = TRUE WHERE plan = 'free';

-- ────────────────────────────────────────────────────────────────────
-- E. Seed feature_catalog with the 22 features in scope
--    (15 already in FEATURE_LABELS + 7 new ones identified by audit).
--    Costs are at 250 DA/USD parallel rate, average tenant usage.
-- ────────────────────────────────────────────────────────────────────

INSERT INTO feature_catalog (slug, label_fr, label_ar, category, icon, description_fr, cost_da_monthly_estimated, is_implemented, display_order)
VALUES
  -- Core (always included even in the cheapest plan)
  ('pipeline',                'Pipeline kanban',           'مسار العملاء',                'core',          'Kanban',     'Suivi des clients par étape de vente',                       0,    TRUE,  10),
  ('tasks',                   'Tâches',                    'المهام',                       'core',          'ListTodo',   'Gestion des tâches et to-do par agent',                      0,    TRUE,  20),
  ('visites',                 'Visites',                   'الزيارات',                     'core',          'Calendar',   'Planification et suivi des visites',                         0,    TRUE,  30),
  ('dossiers',                'Dossiers ventes',           'ملفات البيع',                  'core',          'FileText',   'Suivi des ventes, encaissements et impayés',                 0,    TRUE,  40),
  ('agents',                  'Gestion agents',            'إدارة الوكلاء',                'core',          'Users',      'Multi-agents, rôles, statut',                                0,    TRUE,  50),

  -- AI features
  ('ai_suggestions',          'Suggestions IA',            'اقتراحات الذكاء الاصطناعي',    'ai',            'Sparkles',   'Claude suggère prochaines actions par client',               1500, TRUE,  100),
  ('ai_scripts',              'Scripts d''appel IA',       'سيناريوهات المكالمات',         'ai',            'Phone',      'Scripts d''appel personnalisés par stade pipeline',          2000, TRUE,  110),
  ('engagement_score',        'Score d''engagement',       'نقاط التفاعل',                 'ai',            'TrendingUp', 'Pastille HOT/WARM/COLD recalculée toutes les 6h',            500,  TRUE,  120),
  ('ai_documents',            'Documents IA',              'مستندات بالذكاء الاصطناعي',    'ai',            'FileText',   'Génération auto de contrats par IA (à venir)',               0,    FALSE, 130),
  ('ai_custom',               'IA personnalisée',          'ذكاء اصطناعي مخصص',            'ai',            'Brain',      'Modèles affinés par tenant (à venir)',                       0,    FALSE, 140),
  ('x_assistant_qa',          'Assistant X — Questions',   'المساعد X — أسئلة',            'ai',            'MessageCircle','Voice/text Q&A sur tout le CRM (Phase 1)',                 3000, FALSE, 150),
  ('x_assistant_actions',     'Assistant X — Actions',     'المساعد X — إجراءات',          'ai',            'Zap',        'X exécute des actions à la voix (Phase 2)',                  5000, FALSE, 160),
  ('x_voice',                 'Assistant X — Voix',        'المساعد X — صوت',              'ai',            'Mic',        'Reconnaissance + synthèse vocale (Whisper + TTS)',           2000, FALSE, 170),

  -- Communication
  ('whatsapp',                'WhatsApp Business',         'واتساب الأعمال',               'communication', 'MessageSquare','Envoi messages via Meta Cloud API',                         3000, TRUE,  200),
  ('inbox_whatsapp',          'Boîte de réception WhatsApp','صندوق وارد واتساب',           'communication', 'Inbox',      'Vue conversations multi-agents',                             0,    TRUE,  210),
  ('multi_channel_automation','Automation multi-canal',    'الأتمتة متعددة القنوات',       'communication', 'GitBranch',  'Relance auto SMS/WhatsApp/email après 48h',                  500,  TRUE,  220),

  -- Marketing
  ('email_marketing',         'Email Marketing',           'التسويق عبر البريد',           'marketing',     'Mail',       'Campagnes email + templates drag-drop',                      1500, TRUE,  300),
  ('landing_pages',           'Landing Pages',             'صفحات الالتقاط',               'marketing',     'Globe',      'Pages de capture leads par campagne',                        500,  TRUE,  310),
  ('roi_marketing',           'ROI Marketing',             'عائد التسويق',                 'marketing',     'BarChart3',  'Attribution + ROI par campagne',                             0,    TRUE,  320),

  -- Tools
  ('export_csv',              'Export CSV',                'تصدير CSV',                    'tools',         'Download',   'Export de toutes les listes en CSV',                         0,    TRUE,  400),
  ('pdf_generation',          'Génération PDF',            'إنشاء PDF',                    'tools',         'FileText',   'Contrats, échéanciers, bons de réservation en PDF',          100,  TRUE,  410),
  ('custom_branding',         'Personnalisation marque',   'تخصيص العلامة',                'tools',         'Palette',    'Logo + couleurs + nom personnalisés',                        0,    TRUE,  420),
  ('api_access',              'Accès API',                 'الوصول إلى API',               'tools',         'Code',       'Webhooks + endpoints REST (à venir)',                        0,    FALSE, 430),

  -- Admin / advanced
  ('permission_profiles',     'Profils de permissions',    'ملفات الصلاحيات',              'admin',         'Shield',     'RBAC custom (au-delà admin/agent)',                          0,    TRUE,  500),
  ('reports_advanced',        'Rapports avancés',          'التقارير المتقدمة',            'admin',         'BarChart3',  'Rapports détaillés par équipe et par agent',                 0,    TRUE,  510),
  ('performance_dashboards',  'Tableaux performance',      'لوحات الأداء',                 'admin',         'Activity',   'KPIs temps réel, entonnoir, source analyse',                 0,    TRUE,  520)

ON CONFLICT (slug) DO UPDATE
  SET label_fr                  = EXCLUDED.label_fr,
      label_ar                  = EXCLUDED.label_ar,
      category                  = EXCLUDED.category,
      icon                      = EXCLUDED.icon,
      description_fr            = EXCLUDED.description_fr,
      cost_da_monthly_estimated = EXCLUDED.cost_da_monthly_estimated,
      is_implemented            = EXCLUDED.is_implemented,
      display_order             = EXCLUDED.display_order,
      updated_at                = NOW();

-- ────────────────────────────────────────────────────────────────────
-- F. RPC: recompute_plan_costs — sums feature costs per plan based
--    on the features JSONB in plan_limits and updates
--    estimated_cost_da_monthly + gross_margin_pct accordingly.
--    Call after any edit to either plan_limits.features or
--    feature_catalog.cost_da_monthly_estimated.
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION recompute_plan_costs()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  v_cost NUMERIC;
  v_revenue NUMERIC;
BEGIN
  -- Allow super_admin (called from UI) OR service_role bypass (cron/CLI).
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  FOR p IN SELECT plan, features, price_monthly FROM plan_limits LOOP
    SELECT COALESCE(SUM(fc.cost_da_monthly_estimated), 0)
      INTO v_cost
      FROM feature_catalog fc
      WHERE (p.features ->> fc.slug)::BOOLEAN = TRUE
        AND fc.is_implemented = TRUE;

    v_revenue := COALESCE(p.price_monthly, 0);

    UPDATE plan_limits
       SET estimated_cost_da_monthly = v_cost,
           gross_margin_pct          = CASE
             WHEN v_revenue > 0 THEN ROUND(((v_revenue - v_cost) / v_revenue * 100)::numeric, 2)
             ELSE 0
           END
     WHERE plan = p.plan;
  END LOOP;
END;
$$;

-- Inline backfill (don't go through the RPC during migration — auth.uid()
-- is NULL when migrations run via the migration runner role)
DO $$
DECLARE
  p RECORD;
  v_cost NUMERIC;
  v_revenue NUMERIC;
BEGIN
  FOR p IN SELECT plan, features, price_monthly FROM plan_limits LOOP
    SELECT COALESCE(SUM(fc.cost_da_monthly_estimated), 0)
      INTO v_cost
      FROM feature_catalog fc
      WHERE (p.features ->> fc.slug)::BOOLEAN = TRUE
        AND fc.is_implemented = TRUE;

    v_revenue := COALESCE(p.price_monthly, 0);

    UPDATE plan_limits
       SET estimated_cost_da_monthly = v_cost,
           gross_margin_pct          = CASE
             WHEN v_revenue > 0 THEN ROUND(((v_revenue - v_cost) / v_revenue * 100)::numeric, 2)
             ELSE 0
           END
     WHERE plan = p.plan;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
