-- ================================================
-- Audit fixes: search_path + missing indexes
-- ================================================

-- Fix search_path on trigger functions (security)
CREATE OR REPLACE FUNCTION update_unit_on_sale() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE units SET status = 'sold', client_id = NEW.client_id WHERE id = NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION log_stage_change() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage THEN
    INSERT INTO history (tenant_id, client_id, agent_id, type, title, metadata)
    VALUES (NEW.tenant_id, NEW.id, NEW.agent_id, 'stage_change',
      'Changement etape: ' || OLD.pipeline_stage || ' -> ' || NEW.pipeline_stage,
      jsonb_build_object('from', OLD.pipeline_stage, 'to', NEW.pipeline_stage));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_unit_on_reservation() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE units SET status = 'reserved', client_id = NEW.client_id WHERE id = NEW.unit_id;
  ELSIF NEW.status IN ('expired', 'cancelled') AND (OLD.status = 'active') THEN
    UPDATE units SET status = 'available', client_id = NULL WHERE id = NEW.unit_id AND status = 'reserved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_last_contact() RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients SET last_contact_at = NOW() WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET last_activity = NOW() WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Missing FK indexes (performance)
CREATE INDEX IF NOT EXISTS idx_call_responses_script ON call_responses(script_id);
CREATE INDEX IF NOT EXISTS idx_call_responses_tenant ON call_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_charges_sale ON charges(sale_id);
CREATE INDEX IF NOT EXISTS idx_documents_sale ON documents(sale_id);
CREATE INDEX IF NOT EXISTS idx_history_agent ON history(agent_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_agent ON landing_pages(default_agent_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_project ON landing_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_tenant ON payment_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_agent ON reservations(agent_id);
CREATE INDEX IF NOT EXISTS idx_reservations_project ON reservations(project_id);
CREATE INDEX IF NOT EXISTS idx_sale_amenities_sale ON sale_amenities(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_project ON sales(project_id);
CREATE INDEX IF NOT EXISTS idx_sales_reservation ON sales(reservation_id);
CREATE INDEX IF NOT EXISTS idx_units_agent ON units(agent_id);
CREATE INDEX IF NOT EXISTS idx_units_client ON units(client_id);
CREATE INDEX IF NOT EXISTS idx_visits_project ON visits(project_id);
