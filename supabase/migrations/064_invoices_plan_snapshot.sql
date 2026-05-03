-- ════════════════════════════════════════════════════════════════════
-- 064 — Snapshot the active plan inside each payment record
-- ════════════════════════════════════════════════════════════════════
-- Without this, "5000 DA paid June 2026" can't be traced back to which
-- plan the tenant was on at the time. If the founder upgrades the
-- tenant from Starter to Pro mid-period, looking at tenants.plan today
-- gives the wrong answer for past payments. Storing the plan on the
-- invoice row freezes the history.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS plan TEXT
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'));

-- Backfill existing rows with the tenant's current plan as a best-effort
-- guess. The founder can correct individual rows from the BillingPage
-- if any are wrong.
UPDATE invoices i
SET plan = COALESCE(i.plan, t.plan, 'starter')
FROM tenants t
WHERE i.tenant_id = t.id
  AND i.plan IS NULL;

-- Going forward this should always be set so analytics by plan work.
ALTER TABLE invoices
  ALTER COLUMN plan SET DEFAULT 'starter',
  ALTER COLUMN plan SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_plan_received_at
  ON invoices(plan, received_at DESC);

COMMENT ON COLUMN invoices.plan IS
  'Plan that was active at the time of this payment. Snapshot — does not auto-update if tenants.plan changes later.';
