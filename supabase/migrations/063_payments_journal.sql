-- ════════════════════════════════════════════════════════════════════
-- 063 — Convert invoices into a manual payments journal
-- ════════════════════════════════════════════════════════════════════
-- IMMO PRO-X charges its tenants in cash (CCP / CTT / cash / virement),
-- not via automated billing. The original invoices table was built for
-- a Stripe-style monthly cron that's never been wired up. We're
-- repurposing the same table as a manual payments journal so the
-- super-admin can log "X paid Y DA on date Z for plan Pro covering
-- period A→B". The expiry of the latest period is what the health
-- system uses to warn "this tenant's subscription is about to run out".
--
-- Non-destructive: existing columns stay in place (period TEXT,
-- due_date, status — unused going forward but kept for any historical
-- rows). New columns hold the source of truth.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('cash', 'ccp', 'ctt', 'virement', 'cheque', 'other')),
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end   DATE,
  ADD COLUMN IF NOT EXISTS notes        TEXT,
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_at  DATE;

-- Backfill so existing rows aren't broken
UPDATE invoices
SET
  payment_method = COALESCE(payment_method, 'cash'),
  period_start   = COALESCE(period_start, (period || '-01')::DATE),
  period_end     = COALESCE(period_end,   ((period || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE),
  received_at    = COALESCE(received_at,  paid_at::DATE, created_at::DATE)
WHERE payment_method IS NULL OR period_start IS NULL OR period_end IS NULL OR received_at IS NULL;

-- Going forward these are mandatory
ALTER TABLE invoices
  ALTER COLUMN payment_method SET DEFAULT 'cash',
  ALTER COLUMN payment_method SET NOT NULL,
  ALTER COLUMN period_start   SET NOT NULL,
  ALTER COLUMN period_end     SET NOT NULL,
  ALTER COLUMN received_at    SET DEFAULT CURRENT_DATE,
  ALTER COLUMN received_at    SET NOT NULL;

-- The legacy `period` TEXT and `due_date` aren't used by the new UI but
-- we keep them NOT NULL relaxed so new inserts can omit them.
ALTER TABLE invoices
  ALTER COLUMN period   DROP NOT NULL,
  ALTER COLUMN due_date DROP NOT NULL;

-- For "subscription expires in X days" lookups
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_period_end
  ON invoices(tenant_id, period_end DESC);

-- A view that answers "what's the latest paid period_end per tenant?"
-- — used by the health hook and by the BillingPage stats.
CREATE OR REPLACE VIEW tenant_subscription_status AS
SELECT
  t.id   AS tenant_id,
  t.name AS tenant_name,
  t.plan,
  MAX(i.period_end) AS expires_on,
  CASE
    WHEN MAX(i.period_end) IS NULL                                 THEN 'no_payment'
    WHEN MAX(i.period_end) < CURRENT_DATE                          THEN 'expired'
    WHEN MAX(i.period_end) < CURRENT_DATE + INTERVAL '7 days'      THEN 'expiring_soon'
    WHEN MAX(i.period_end) < CURRENT_DATE + INTERVAL '30 days'     THEN 'renewal_due'
    ELSE 'active'
  END AS status,
  GREATEST(0, (MAX(i.period_end) - CURRENT_DATE))::INTEGER AS days_until_expiry
FROM tenants t
LEFT JOIN invoices i ON i.tenant_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name, t.plan;

-- The view inherits RLS from `tenants` (and `invoices`). Super admins
-- already have read-all on both via existing policies (migrations 044-046).
GRANT SELECT ON tenant_subscription_status TO authenticated;

COMMENT ON VIEW tenant_subscription_status IS
  'Subscription state per tenant derived from the latest invoices.period_end. Used by Super Admin to spot expiring subscriptions.';
