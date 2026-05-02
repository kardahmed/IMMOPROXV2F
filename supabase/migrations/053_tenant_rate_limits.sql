-- ============================================================================
-- 053_tenant_rate_limits.sql
--
-- Adds tenant-level write rate limiting to protect against:
--   1. Compromised accounts spamming inserts (stolen creds → bot)
--   2. Front-end infinite loops creating runaway data
--   3. Concurrent agent activity that overwhelms a tenant's plan
--
-- Strategy: BEFORE INSERT trigger on the highest-volume tables uses the
-- existing rate_limit_buckets table (migration 050) keyed by
-- tenant:{id}:writes:{table}. A 60s window of more than the threshold
-- raises an exception, which aborts the INSERT and surfaces a 23P01-ish
-- error to the client.
--
-- Thresholds are deliberately generous — 500 writes/min/table is far
-- above any human use case but well below what a bot could do. Adjust
-- here if you ever genuinely need higher (eg. data import).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────
-- 1. Trigger function — checks bucket for tenant_id × table
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION tenant_write_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  UUID;
  v_window_ts  BIGINT;
  v_window_ms  BIGINT := 60000;     -- 60s rolling window
  v_limit      INT    := 500;       -- max writes per tenant per minute per table
  v_bucket_key TEXT;
  v_count      INT;
BEGIN
  -- All targeted tables have a tenant_id column. If it's null we skip
  -- the check (shouldn't happen but defensive).
  v_tenant_id := NEW.tenant_id;
  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_window_ts  := (extract(epoch from now()) * 1000 / v_window_ms)::BIGINT;
  v_bucket_key := 'tenant:' || v_tenant_id::TEXT || ':writes:' || TG_TABLE_NAME;

  -- Atomic upsert. ON CONFLICT path is the common case once the bucket
  -- exists for this minute window.
  INSERT INTO rate_limit_buckets (bucket_key, window_ts, count)
  VALUES (v_bucket_key, v_window_ts, 1)
  ON CONFLICT (bucket_key, window_ts)
    DO UPDATE SET count = rate_limit_buckets.count + 1
  RETURNING count INTO v_count;

  IF v_count > v_limit THEN
    RAISE EXCEPTION
      'Tenant write rate limit exceeded on % (% writes in last 60s, max %)',
      TG_TABLE_NAME, v_count, v_limit
      USING ERRCODE = 'P0001',
            HINT = 'Slow down or contact support if this is a legitimate import.';
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 2. Attach trigger to high-volume tables
-- ────────────────────────────────────────────────────────────────────
-- We pick the tables an agent or bot could realistically spam. Tables
-- like sales, reservations, invoices are not in scope — they're 1-per-
-- transaction and gated by other checks.

DROP TRIGGER IF EXISTS tenant_write_rate_limit_clients ON clients;
CREATE TRIGGER tenant_write_rate_limit_clients
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION tenant_write_rate_limit();

DROP TRIGGER IF EXISTS tenant_write_rate_limit_visits ON visits;
CREATE TRIGGER tenant_write_rate_limit_visits
  BEFORE INSERT ON visits
  FOR EACH ROW EXECUTE FUNCTION tenant_write_rate_limit();

DROP TRIGGER IF EXISTS tenant_write_rate_limit_tasks ON tasks;
CREATE TRIGGER tenant_write_rate_limit_tasks
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION tenant_write_rate_limit();

DROP TRIGGER IF EXISTS tenant_write_rate_limit_history ON history;
CREATE TRIGGER tenant_write_rate_limit_history
  BEFORE INSERT ON history
  FOR EACH ROW EXECUTE FUNCTION tenant_write_rate_limit();

DROP TRIGGER IF EXISTS tenant_write_rate_limit_whatsapp_messages ON whatsapp_messages;
CREATE TRIGGER tenant_write_rate_limit_whatsapp_messages
  BEFORE INSERT ON whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION tenant_write_rate_limit();

-- ────────────────────────────────────────────────────────────────────
-- 3. RPC to inspect current rate-limit status for a tenant
-- ────────────────────────────────────────────────────────────────────
-- Super-admin can call this to see if a tenant is approaching the
-- ceiling on any table in real time. Useful for the monitoring page.

CREATE OR REPLACE FUNCTION get_tenant_rate_status(p_tenant_id UUID)
RETURNS TABLE (
  table_name TEXT,
  window_count INT,
  window_limit INT,
  pct_used INT,
  resets_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_ts BIGINT;
  v_window_ms BIGINT := 60000;
  v_limit     INT    := 500;
BEGIN
  -- Caller must be super_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  v_window_ts := (extract(epoch from now()) * 1000 / v_window_ms)::BIGINT;

  RETURN QUERY
  SELECT
    split_part(b.bucket_key, ':writes:', 2)        AS table_name,
    b.count                                        AS window_count,
    v_limit                                        AS window_limit,
    LEAST(100, (b.count * 100 / v_limit))          AS pct_used,
    to_timestamp(((v_window_ts + 1) * v_window_ms)::DOUBLE PRECISION / 1000)
                                                   AS resets_at
  FROM rate_limit_buckets b
  WHERE b.bucket_key LIKE 'tenant:' || p_tenant_id::TEXT || ':writes:%'
    AND b.window_ts = v_window_ts
  ORDER BY b.count DESC;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 4. View — top tenants currently approaching the rate limit
-- ────────────────────────────────────────────────────────────────────
-- Read-only via super-admin RLS on the underlying buckets table.
-- Surfaces only the current-window rows so a refresh always shows
-- "right now" not historical heat.

CREATE OR REPLACE VIEW tenant_rate_pressure_view
WITH (security_invoker = true)
AS
SELECT
  -- Extract tenant_id from bucket_key 'tenant:{uuid}:writes:{table}'
  (regexp_match(b.bucket_key, '^tenant:([0-9a-f-]+):writes:'))[1]::UUID AS tenant_id,
  split_part(b.bucket_key, ':writes:', 2) AS table_name,
  b.count AS writes_in_window,
  500 AS window_limit,
  LEAST(100, b.count * 100 / 500) AS pct_used
FROM rate_limit_buckets b
WHERE b.bucket_key LIKE 'tenant:%:writes:%'
  AND b.window_ts = (extract(epoch from now()) * 1000 / 60000)::BIGINT
  AND b.count >= 50;  -- only surface tenants at >=10% pressure

GRANT SELECT ON tenant_rate_pressure_view TO authenticated;

NOTIFY pgrst, 'reload schema';
