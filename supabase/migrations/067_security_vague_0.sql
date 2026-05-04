-- ════════════════════════════════════════════════════════════════════
-- 067 — Vague 0 security audit fixes
-- ════════════════════════════════════════════════════════════════════
-- Six tightenings flagged by the brutal audit. None of them change
-- normal product behavior — Edge Functions all run as service_role
-- and bypass RLS, so locking down the authenticated/anon paths is
-- pure hardening.
--
-- Skipped from the audit list:
--   - tenant_counts_view + tenant_rate_pressure_view: already have
--     security_invoker = true in their CREATE statements (the audit
--     misread).
--   - whatsapp_templates SELECT: the table has no tenant_id column;
--     it's a platform-global catalog of Meta-approved templates that
--     every tenant SHOULD be able to pick from. Tightening here would
--     break the WhatsApp send flow.
-- ════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 0.1 — tenant_subscription_status (mig 063, mine) leaked across
--       tenants because the view defaulted to SECURITY DEFINER
--       behavior, bypassing the underlying invoices RLS. Flipping
--       to security_invoker forces RLS on `invoices` to apply per
--       caller — tenants only see their own row, super_admins see
--       all (the view JOINs through tenants which has its own RLS).
-- ──────────────────────────────────────────────────────────────────
ALTER VIEW tenant_subscription_status SET (security_invoker = true);

COMMENT ON VIEW tenant_subscription_status IS
  'Subscription state per tenant derived from the latest invoices.period_end. security_invoker=true so RLS on invoices is enforced per caller (tenant sees their own; super_admin sees all).';

-- ──────────────────────────────────────────────────────────────────
-- 0.2 — users INSERT: the original 001 policy let any authenticated
--       caller insert their own row with an arbitrary role and
--       tenant_id (only the trigger from 044 protects UPDATE, not
--       INSERT). Drop the policy entirely — every legitimate user
--       creation goes through invite-tenant-agent or
--       create-tenant-user Edge Functions, both of which use the
--       service_role key and bypass RLS. No client-side user
--       creation path remains.
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_insert ON users;

-- (No replacement policy. INSERT is denied to authenticated/anon by
-- the absence of any matching policy — Postgres RLS default-deny.)

-- ──────────────────────────────────────────────────────────────────
-- 0.3 — global_playbook holds the platform's AI system prompt — the
--       founder's competitive moat. The original policy let every
--       authenticated tenant read it. Edge Functions run as
--       service_role and bypass RLS, so they keep injecting the
--       prompt into Claude calls. Only the Super Admin UI ever
--       needs to read or edit it interactively.
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS global_playbook_read_authenticated ON global_playbook;
CREATE POLICY global_playbook_read_super_admin ON global_playbook
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 0.5 — rate_limit_bump RPC was granted EXECUTE to anon, which means
--       a hostile anonymous visitor could deliberately exhaust any
--       bucket key (e.g. `capture-lead:&lt;victim-ip&gt;`) to lock real
--       leads out, or fill the rate_limit_buckets table with junk
--       entries (storage exhaustion DoS). The function is only ever
--       called from inside Edge Functions (verified — only
--       _shared/rateLimit.ts:77), and Edge Functions use a
--       service_role client. Revoke from anon and authenticated.
-- ──────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION rate_limit_bump(TEXT, BIGINT) FROM anon, authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 0.6 — service_insert_* policies on email_logs / api_costs /
--       quota_alerts_sent were created with `WITH CHECK (true)` and
--       no `TO service_role` clause, so any authenticated user
--       could forge entries — hide failed emails, skew billing
--       dashboards, silence quota alerts. Replace each with the
--       same WITH CHECK but pinned to service_role.
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_insert_email_logs ON email_logs;
CREATE POLICY service_insert_email_logs ON email_logs
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS service_insert_api_costs ON api_costs;
CREATE POLICY service_insert_api_costs ON api_costs
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS service_insert_quota_alerts ON quota_alerts_sent;
CREATE POLICY service_insert_quota_alerts ON quota_alerts_sent
  FOR INSERT TO service_role
  WITH CHECK (true);
