-- ════════════════════════════════════════════════════════════════════
-- 069 — Vague 2A: dashboard_summary RPC
-- ════════════════════════════════════════════════════════════════════
-- Pre-fix `useDashboardStats` fired 12 separate Supabase queries on
-- every dashboard mount, several of them unbounded (`select * from
-- clients/units` with no .limit()). For a tenant with 5k clients +
-- 5k units the dashboard load was ~5MB of JSON over the wire and
-- a multi-second TTI.
--
-- This RPC computes every KPI / list / breakdown in a single SQL
-- round-trip using aggregate / window functions on the indexed
-- columns. The frontend now hands in tenant_id + (for agents) the
-- caller's user_id, gets back a single JSONB blob shaped like the
-- DashboardStats interface, and renders.
--
-- Multi-tenant safe via SECURITY INVOKER: RLS on the underlying
-- tables (clients / units / sales / etc.) still applies per caller,
-- so an agent can only aggregate their own clients and a tenant
-- admin only their own tenant.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION dashboard_summary(
  p_tenant_id UUID,
  p_user_id   UUID DEFAULT NULL,
  p_is_agent  BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_now           TIMESTAMPTZ := now();
  v_today         DATE        := CURRENT_DATE;
  v_month_start   TIMESTAMPTZ := date_trunc('month', v_now);
  v_5d_ago        TIMESTAMPTZ := v_now - INTERVAL '5 days';
  v_6mo_ago       TIMESTAMPTZ := date_trunc('month', v_now - INTERVAL '5 months');
  v_result        JSONB;
BEGIN
  WITH
  -- ── Units, optionally scoped to the calling agent ───────────────
  scoped_units AS (
    SELECT u.* FROM units u
    WHERE u.tenant_id = p_tenant_id
      AND (NOT p_is_agent OR u.agent_id = p_user_id)
  ),
  -- ── Sales, scoped per agent if needed ───────────────────────────
  scoped_sales AS (
    SELECT s.* FROM sales s
    WHERE s.tenant_id = p_tenant_id
      AND s.status = 'active'
      AND (NOT p_is_agent OR s.agent_id = p_user_id)
  ),
  -- ── Top-line KPIs ───────────────────────────────────────────────
  kpis AS (
    SELECT
      (SELECT COUNT(*) FROM projects WHERE tenant_id = p_tenant_id AND status = 'active') AS active_projects,
      (SELECT COUNT(*) FROM scoped_units) AS total_units,
      (SELECT COUNT(*) FROM scoped_units WHERE status = 'sold') AS sold_units,
      (SELECT COUNT(*) FROM scoped_units WHERE status = 'reserved') AS reserved_units,
      (SELECT COALESCE(SUM(final_price), 0) FROM scoped_sales) AS revenue,
      (SELECT COUNT(*) FROM clients WHERE tenant_id = p_tenant_id AND deleted_at IS NULL) AS total_clients,
      (SELECT COUNT(*) FROM payment_schedules WHERE tenant_id = p_tenant_id AND status = 'late') AS overdue_count,
      (SELECT COALESCE(SUM(amount), 0) FROM payment_schedules WHERE tenant_id = p_tenant_id AND status = 'late') AS overdue_amount,
      (SELECT COUNT(*) FROM tasks WHERE tenant_id = p_tenant_id AND status = 'pending' AND deleted_at IS NULL AND scheduled_at::date = v_today) AS today_tasks,
      (SELECT COUNT(*) FROM tasks WHERE tenant_id = p_tenant_id AND status = 'pending' AND deleted_at IS NULL AND scheduled_at::date < v_today) AS overdue_tasks
  ),
  -- ── Per-project unit breakdown ──────────────────────────────────
  project_progress AS (
    SELECT
      p.id, p.name, p.code, p.status,
      COUNT(u.id) FILTER (WHERE u.id IS NOT NULL) AS total,
      COUNT(u.id) FILTER (WHERE u.status = 'sold')      AS sold,
      COUNT(u.id) FILTER (WHERE u.status = 'reserved')  AS reserved,
      COUNT(u.id) FILTER (WHERE u.status = 'available') AS available,
      COUNT(u.id) FILTER (WHERE u.status = 'blocked')   AS blocked
    FROM projects p
    LEFT JOIN units u ON u.project_id = p.id
    WHERE p.tenant_id = p_tenant_id AND p.status = 'active'
    GROUP BY p.id, p.name, p.code, p.status
    ORDER BY p.name
  ),
  -- ── Recent activity (last 10 history rows) ──────────────────────
  recent AS (
    SELECT
      h.id, h.type, h.title, h.created_at,
      cl.full_name AS client_name,
      CONCAT_WS(' ', us.first_name, us.last_name) AS agent_name
    FROM history h
    LEFT JOIN clients cl ON cl.id = h.client_id
    LEFT JOIN users   us ON us.id = h.agent_id
    WHERE h.tenant_id = p_tenant_id
      AND h.deleted_at IS NULL
    ORDER BY h.created_at DESC
    LIMIT 10
  ),
  -- ── Agent performance for the month ─────────────────────────────
  agent_perf AS (
    SELECT
      u.id, u.first_name, u.last_name, u.last_activity,
      (SELECT COUNT(*) FROM reservations r WHERE r.agent_id = u.id AND r.status = 'active' AND r.created_at >= v_month_start) AS reservations_count,
      (SELECT COUNT(*) FROM sales s WHERE s.agent_id = u.id AND s.status = 'active' AND s.created_at >= v_month_start) AS sales_count,
      (SELECT COALESCE(SUM(s.final_price), 0) FROM sales s WHERE s.agent_id = u.id AND s.status = 'active' AND s.created_at >= v_month_start) AS revenue
    FROM users u
    WHERE u.tenant_id = p_tenant_id
      AND u.role = 'agent'
      AND u.status = 'active'
      AND NOT p_is_agent  -- agents don't get the team leaderboard
  ),
  -- ── Pipeline funnel: count + percentage per stage ───────────────
  funnel_counts AS (
    SELECT pipeline_stage, COUNT(*)::int AS cnt
    FROM clients
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
    GROUP BY pipeline_stage
  ),
  -- ── At-risk clients: 5+ days no contact, not in vente/perdue ───
  at_risk AS (
    SELECT
      c.id, c.full_name, c.phone, c.pipeline_stage, c.last_contact_at,
      EXTRACT(DAY FROM v_now - COALESCE(c.last_contact_at, c.created_at))::int AS days_without_contact,
      CONCAT_WS(' ', us.first_name, us.last_name) AS agent_name
    FROM clients c
    LEFT JOIN users us ON us.id = c.agent_id
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND c.pipeline_stage NOT IN ('vente', 'perdue')
      AND (c.last_contact_at IS NULL OR c.last_contact_at < v_5d_ago)
      AND (NOT p_is_agent OR c.agent_id = p_user_id)
    ORDER BY days_without_contact DESC
    LIMIT 5
  ),
  -- ── Visits scheduled for today ──────────────────────────────────
  today_visits AS (
    SELECT
      v.id, v.scheduled_at, v.status,
      cl.full_name AS client_name,
      CONCAT_WS(' ', us.first_name, us.last_name) AS agent_name,
      pj.name AS project_name
    FROM visits v
    LEFT JOIN clients  cl ON cl.id = v.client_id
    LEFT JOIN users    us ON us.id = v.agent_id
    LEFT JOIN projects pj ON pj.id = v.project_id
    WHERE v.tenant_id = p_tenant_id
      AND v.deleted_at IS NULL
      AND v.scheduled_at::date = v_today
      AND (NOT p_is_agent OR v.agent_id = p_user_id)
    ORDER BY v.scheduled_at
  ),
  -- ── Source breakdown for clients ────────────────────────────────
  sources AS (
    SELECT COALESCE(source, 'autre') AS source, COUNT(*)::int AS cnt
    FROM clients
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
    GROUP BY COALESCE(source, 'autre')
    ORDER BY cnt DESC
  ),
  -- ── Monthly revenue last 6 months (group sales by month) ────────
  monthly_revenue AS (
    SELECT
      to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS month_key,
      COALESCE(SUM(s.final_price), 0)::bigint AS revenue
    FROM sales s
    WHERE s.tenant_id = p_tenant_id
      AND s.status = 'active'
      AND s.created_at >= v_6mo_ago
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'activeProjects',  k.active_projects,
    'totalUnits',      k.total_units,
    'soldUnits',       k.sold_units,
    'reservedUnits',   k.reserved_units,
    'revenue',         k.revenue,
    'saleRate',        CASE WHEN k.total_units > 0
                            THEN round(((k.sold_units + k.reserved_units)::numeric / k.total_units) * 100, 1)
                            ELSE 0 END,
    'totalClients',    k.total_clients,
    'overduePayments', k.overdue_count,
    'overdueAmount',   k.overdue_amount,
    'todayTasks',      k.today_tasks,
    'overdueTasks',    k.overdue_tasks,
    'projectProgress', COALESCE((SELECT jsonb_agg(to_jsonb(pp)) FROM project_progress pp), '[]'::jsonb),
    'recentActivity',  COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM recent r), '[]'::jsonb),
    'agentPerformance',COALESCE((SELECT jsonb_agg(to_jsonb(ap)) FROM agent_perf ap), '[]'::jsonb),
    'atRiskClients',   COALESCE((SELECT jsonb_agg(to_jsonb(ar)) FROM at_risk ar), '[]'::jsonb),
    'todayVisits',     COALESCE((SELECT jsonb_agg(to_jsonb(tv)) FROM today_visits tv), '[]'::jsonb),
    'sourceBreakdown', COALESCE((SELECT jsonb_agg(jsonb_build_object('source', s.source, 'count', s.cnt)) FROM sources s), '[]'::jsonb),
    'pipelineFunnel',  COALESCE((SELECT jsonb_agg(jsonb_build_object('stage', fc.pipeline_stage, 'count', fc.cnt, 'percentage',
                                          CASE WHEN k.total_clients > 0 THEN round((fc.cnt::numeric / k.total_clients) * 100, 1) ELSE 0 END))
                       FROM funnel_counts fc), '[]'::jsonb),
    'monthlyRevenue',  COALESCE((SELECT jsonb_agg(jsonb_build_object('month', mr.month_key, 'revenue', mr.revenue) ORDER BY mr.month_key)
                       FROM monthly_revenue mr), '[]'::jsonb)
  )
  INTO v_result
  FROM kpis k;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION dashboard_summary(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dashboard_summary(UUID, UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION dashboard_summary(UUID, UUID, BOOLEAN) IS
  'Returns the dashboard KPIs + lists in a single round-trip. SECURITY INVOKER → RLS on the underlying tables (clients / units / sales / history / etc.) applies per caller, so an agent only sees their own data and a tenant admin only their tenant. Replaces 12 separate queries that fired on every dashboard mount.';

-- ──────────────────────────────────────────────────────────────────
-- Indexes that make this RPC actually fast.
-- The aggregate scans hit (tenant_id, status), (tenant_id, deleted_at)
-- and date-range filters on created_at / scheduled_at most often.
-- Most of these likely already exist; CREATE INDEX IF NOT EXISTS so
-- this migration is idempotent.
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_units_tenant_status        ON units(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_status_created ON sales(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_stage       ON clients(tenant_id, pipeline_stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_tenant_lastcontact ON clients(tenant_id, last_contact_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_visits_tenant_scheduled    ON visits(tenant_id, scheduled_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_history_tenant_created     ON history(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status_sched  ON tasks(tenant_id, status, scheduled_at) WHERE deleted_at IS NULL;
