-- ================================================
-- IMMO PRO-X V2F — Full schema creation
-- Run this in Supabase SQL Editor
-- ================================================

-- ─── Extensions ───
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Enums ───
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('active', 'inactive', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE unit_type AS ENUM ('apartment', 'local', 'villa', 'parking');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE unit_subtype AS ENUM ('F2', 'F3', 'F4', 'F5', 'F6');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE unit_status AS ENUM ('available', 'reserved', 'sold', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pipeline_stage AS ENUM ('accueil', 'visite_a_gerer', 'visite_confirmee', 'visite_terminee', 'negociation', 'reservation', 'vente', 'relancement', 'perdue');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE client_source AS ENUM ('facebook_ads', 'google_ads', 'instagram_ads', 'appel_entrant', 'reception', 'bouche_a_oreille', 'reference_client', 'site_web', 'portail_immobilier', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE client_type AS ENUM ('individual', 'company');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE interest_level AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('comptant', 'credit', 'lpp', 'aadl', 'mixte');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE visit_type AS ENUM ('on_site', 'office', 'virtual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE visit_status AS ENUM ('planned', 'confirmed', 'completed', 'cancelled', 'rescheduled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE deposit_method AS ENUM ('cash', 'bank_transfer', 'cheque');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reservation_status AS ENUM ('active', 'expired', 'cancelled', 'converted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE financing_mode AS ENUM ('comptant', 'credit', 'mixte');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sale_status AS ENUM ('active', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'late');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE charge_type AS ENUM ('notaire', 'agence', 'promotion', 'enregistrement', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE history_type AS ENUM ('stage_change', 'visit_planned', 'visit_confirmed', 'visit_completed', 'call', 'whatsapp_call', 'whatsapp_message', 'sms', 'email', 'reservation', 'sale', 'payment', 'document', 'note', 'ai_task');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_type AS ENUM ('ai_generated', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending', 'done', 'ignored');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_type AS ENUM ('contrat_vente', 'echeancier', 'bon_reservation', 'cin', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE goal_metric AS ENUM ('sales_count', 'reservations_count', 'visits_count', 'revenue', 'new_clients', 'conversion_rate');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE goal_period AS ENUM ('monthly', 'quarterly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE goal_status AS ENUM ('in_progress', 'achieved', 'exceeded', 'not_achieved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── Tables ───

-- 1. Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  website TEXT,
  wilaya TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users (links to auth.users via id)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'agent',
  status user_status NOT NULL DEFAULT 'active',
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  delivery_date DATE,
  avg_price_per_unit NUMERIC,
  cover_url TEXT,
  gallery_urls TEXT[],
  status project_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Units
CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  type unit_type NOT NULL DEFAULT 'apartment',
  subtype unit_subtype,
  building TEXT,
  floor INTEGER,
  surface NUMERIC,
  price NUMERIC,
  delivery_date DATE,
  plan_2d_url TEXT,
  status unit_status NOT NULL DEFAULT 'available',
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  nin_cin TEXT,
  cin_verified BOOLEAN NOT NULL DEFAULT FALSE,
  cin_doc_url TEXT,
  client_type client_type NOT NULL DEFAULT 'individual',
  birth_date DATE,
  nationality TEXT NOT NULL DEFAULT 'DZ',
  profession TEXT,
  address TEXT,
  pipeline_stage pipeline_stage NOT NULL DEFAULT 'accueil',
  source client_source NOT NULL,
  desired_unit_types TEXT[],
  interested_projects TEXT[],
  confirmed_budget NUMERIC,
  interest_level interest_level NOT NULL DEFAULT 'medium',
  visit_note NUMERIC,
  visit_feedback TEXT,
  payment_method payment_method,
  notes TEXT,
  is_priority BOOLEAN NOT NULL DEFAULT FALSE,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from units.client_id to clients after clients table is created
ALTER TABLE units ADD CONSTRAINT fk_units_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- 6. Visits
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  visit_type visit_type NOT NULL DEFAULT 'on_site',
  status visit_status NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Reservations
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  nin_cin TEXT NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  expires_at TIMESTAMPTZ NOT NULL,
  deposit_amount NUMERIC NOT NULL DEFAULT 0,
  deposit_method deposit_method,
  deposit_reference TEXT,
  status reservation_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Sales
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  total_price NUMERIC NOT NULL,
  discount_type discount_type,
  discount_value NUMERIC NOT NULL DEFAULT 0,
  final_price NUMERIC NOT NULL,
  financing_mode financing_mode NOT NULL DEFAULT 'comptant',
  delivery_date DATE,
  internal_notes TEXT,
  status sale_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Payment Schedules
CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  status payment_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Charges
CREATE TABLE IF NOT EXISTS charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  type charge_type NOT NULL DEFAULT 'autre',
  amount NUMERIC NOT NULL,
  charge_date DATE,
  status payment_status NOT NULL DEFAULT 'pending',
  doc_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Sale Amenities
CREATE TABLE IF NOT EXISTS sale_amenities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. History
CREATE TABLE IF NOT EXISTS history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type history_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  type task_type NOT NULL DEFAULT 'manual',
  status task_status NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  type doc_type NOT NULL DEFAULT 'autre',
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Agent Goals
CREATE TABLE IF NOT EXISTS agent_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric goal_metric NOT NULL,
  period goal_period NOT NULL DEFAULT 'monthly',
  target_value NUMERIC NOT NULL,
  current_value NUMERIC NOT NULL DEFAULT 0,
  status goal_status NOT NULL DEFAULT 'in_progress',
  started_at DATE NOT NULL,
  ended_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Tenant Settings
CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  urgent_alert_days INTEGER NOT NULL DEFAULT 3,
  relaunch_alert_days INTEGER NOT NULL DEFAULT 7,
  reservation_duration_days INTEGER NOT NULL DEFAULT 30,
  min_deposit_amount NUMERIC NOT NULL DEFAULT 100000,
  language TEXT NOT NULL DEFAULT 'fr',
  notif_agent_inactive BOOLEAN NOT NULL DEFAULT TRUE,
  notif_payment_late BOOLEAN NOT NULL DEFAULT TRUE,
  notif_reservation_expired BOOLEAN NOT NULL DEFAULT TRUE,
  notif_new_client BOOLEAN NOT NULL DEFAULT TRUE,
  notif_new_sale BOOLEAN NOT NULL DEFAULT TRUE,
  notif_goal_achieved BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Document Templates
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type doc_type NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── Indexes ───

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_agent ON clients(agent_id);
CREATE INDEX IF NOT EXISTS idx_clients_stage ON clients(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_visits_tenant ON visits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visits_agent ON visits(agent_id);
CREATE INDEX IF NOT EXISTS idx_visits_scheduled ON visits(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_agent ON sales(agent_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_sale ON payment_schedules(sale_id);
CREATE INDEX IF NOT EXISTS idx_history_client ON history(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_goals_agent ON agent_goals(agent_id);


-- ─── RLS Policies ───

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

-- Helper: get the tenant_id of the currently authenticated user
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Tenants: users can only see their own tenant
CREATE POLICY "tenants_select" ON tenants FOR SELECT USING (id = public.get_my_tenant_id());

-- Users: users can see users in their tenant
CREATE POLICY "users_select" ON users FOR SELECT USING (tenant_id = public.get_my_tenant_id());
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "users_update_self" ON users FOR UPDATE USING (id = auth.uid());

-- Generic tenant isolation policies for all data tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'projects', 'units', 'clients', 'visits', 'reservations', 'sales',
    'payment_schedules', 'charges', 'sale_amenities', 'history', 'tasks',
    'documents', 'agent_goals', 'tenant_settings', 'document_templates'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "%s_tenant_select" ON %I FOR SELECT USING (tenant_id = public.get_my_tenant_id())',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "%s_tenant_insert" ON %I FOR INSERT WITH CHECK (tenant_id = public.get_my_tenant_id())',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "%s_tenant_update" ON %I FOR UPDATE USING (tenant_id = public.get_my_tenant_id())',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "%s_tenant_delete" ON %I FOR DELETE USING (tenant_id = public.get_my_tenant_id())',
      tbl, tbl
    );
  END LOOP;
END $$;
