# ROADMAP

Living plan. Update this file at the end of any work session so the
next one can pick up cleanly.

**Legend**: ✅ done · 🚧 in progress · 🧩 partial (half-built, live but incomplete) · 🔜 next · 💭 backlog · 🚫 deferred

---

## ✅ Done — recent milestones

### Architecture split (Apr 2026)
- Separated the React CRM from the marketing site into 2 repos:
  `immoproxv2f` (CRM → `app.immoprox.io`) and
  `immoprox-marketing-website` (static → `immoprox.io`).
- Shared Supabase backend stays in this repo under `supabase/`.
- Hostinger native git integration now watches each repo independently.

### Marketing site
- Sales-led pivot: removed all public pricing, every CTA routes through
  the 2-step contact form (step 1: name/email/phone, step 2: full
  qualification).
- Contact form writes to `marketing_leads` via Supabase anon key + RLS.
- `merci.html` embeds Cal.com booking (`cal.eu/kardahmed`).
- GTM (`GTM-NF3G7HXL`) wired on all 14 pages.
- Pretty URLs via `.htaccess` (`.html` hidden, 301s in place).
- Security headers: X-Frame-Options, Referrer-Policy, HSTS, Permissions-Policy.

### CRM app (`app.immoprox.io`)
- Minimalist login (no marketing panel — centered card, Stripe-like).
- `noindex` meta + `Disallow: /` robots.
- CSP allows `fonts.googleapis.com` / `fonts.gstatic.com`.
- Service worker skips non-http(s) requests (killed 3x Chrome extension errors per page load).
- Leads Super Admin page at `/admin/leads` — KPIs, status filter,
  details modal, one-click "Create tenant from lead" that pre-fills the
  existing create-tenant modal and auto-marks the lead `won` on success.
- `CreateTenantModal` now accepts `defaults` prop + `subtitle` override
  — reused by both the normal flow and lead conversion.

### Backend
- Edge Function `notify-lead-whatsapp` now fully wired to the Meta
  WhatsApp Cloud API with a double-ping strategy: `[NOUVEAU]` fires on
  step-1 INSERT so the founder can call back fast even if the lead
  abandons step 2, then `[QUALIFIE]` fires on the step-2 UPDATE with
  the full qualification context (company, activity, timeline,
  frustration, free-text message). After initially having the
  `new_lead_notification` template re-categorized by Meta as Marketing
  (because "Recontacte sous 1h" read as a sales CTA to Meta's
  classifier), a new `nouveau_lead__immo_prox` template was submitted
  as pure Utility and replaced the old one. Also learnt the hard way
  that Meta's "Generate access token" button on the API Setup page
  always returns 24h tokens — permanent tokens must come from
  Business Settings > System Users with expiration=Never. The
  `notify-lead-whatsapp` function now logs a warning at boot if the
  stored token is <300 chars so we never debug the symptom again.
- Password reset flow live: `LoginPage` "Mot de passe oublie ?" button
  wired to `supabase.auth.resetPasswordForEmail`, paired with a
  dedicated `/reset-password` page that accepts the Supabase recovery
  session from the email link, validates new password (min 8 chars,
  zod cross-field confirm), calls `supabase.auth.updateUser`, then
  redirects to `/dashboard`. Requires
  `https://app.immoprox.io/reset-password` in Supabase Auth Redirect
  URLs and the Reset-Password email template in French.
- WhatsApp schema frozen in `supabase/migrations/016_whatsapp_schema.sql`.
  The 4 tables (`whatsapp_config`, `whatsapp_accounts`,
  `whatsapp_messages`, `whatsapp_templates`) had been created directly
  in Studio so the repo had no recovery trail — the migration captures
  columns, indexes, RLS (tenant-scoped reads, super-admin writes) and
  updated_at triggers. Statements are idempotent (IF NOT EXISTS, DROP
  POLICY IF EXISTS) so it re-runs safely on the live DB without
  disturbing existing rows.

### Security hardening (23-Apr-2026 audit fallout)
- **Migration 017** — rewrote RLS on every sensitive table
  (`clients`, `visits`, `reservations`, `history`, `tasks`,
  `documents`, `whatsapp_messages`, `whatsapp_accounts`) so agents
  only see their own rows (or unassigned rows) and can only UPDATE
  their own. Hard DELETE gated to `admin` + `super_admin` on most
  tables; `reservations` DELETE is super-admin-only (legal + money);
  `history` is append-only below super admin; `whatsapp_messages`
  DELETE + UPDATE locked to super admin (the founder's previous-
  employer story about an agent wiping WhatsApp logs on their way
  out, made law).
- **Migration 018** — dropped the legacy permissive policies
  (`tenant_isolation`, `admin_manage_*`, `super_admin_all_*`,
  `"Tenant access own whatsapp_*"`) that were still attached from
  the Studio era. PostgreSQL OR-combines permissive policies, so
  without 018 the strict 017 rules were being bypassed by the
  looser legacy ones. After 018, `pg_policies` shows exactly 4
  rows per table (select/insert/update/delete) and the agent
  isolation is actually enforced.
- **`security_audit` table + triggers** — populated by SECURITY
  DEFINER triggers on both HARD_DELETE and SOFT_DELETE (when
  `deleted_at` flips from NULL). Every destructive action is
  logged with tenant, user, role, target_type, target_preview
  (human-readable), created_at. Writable only by the triggers and
  service-role; readable by tenant admins + super admin.
- **Soft-delete infrastructure** — `deleted_at` + `deleted_by`
  columns on the 6 sensitive tables, with partial indexes for fast
  Corbeille lookups. `useClients` hook gained `softDeleteClient` +
  `restoreClient` + `useDeletedClients` hooks. Base list queries
  (`useClients`, `useHistory`, `PlanningPage`, `DossiersPage`,
  `VisitsTab`, `SimpleDataTabs`) all filter `.is('deleted_at',
  null)` so soft-deleted rows drop out of the normal views.
- **`/corbeille` page** for admins — lazy-loaded data table
  showing soft-deleted clients with agent, pipeline stage, time
  since deletion, and a "Restaurer" button. Gated behind
  `RoleRoute allowedRoles=['admin','super_admin']`.
- **`/admin/security` page** for super admin — forensic audit log
  with KPIs (total events, hard deletes, soft deletes, number of
  users with >10 destructive actions = flagged as suspect), range
  presets (7j/30j/90j/all), action filter, text search across
  tenant + user + target. Sidebar entry in `SuperAdminLayout`
  between Leads and Audit Trail.
- **Client detail "Mettre à la corbeille" action** — admin-only
  DropdownMenuItem in the "..." menu on the client detail page,
  wired to `softDeleteClient` through a `ConfirmDialog`. Agents
  don't see the option (UI gate) and even if they did, RLS would
  deny the UPDATE.

### Phase 2 foundation — automation engine
- **Migration 019** — added `automation_type`, `automation_metadata`,
  `template_name`, `template_params` columns to `tasks`. Partial
  index on `automation_type IS NOT NULL` + GIN index on the JSONB
  metadata for cron idempotency lookups.
- **`dispatchAutomation()` helper** (`_shared/dispatchAutomation.ts`)
  — the dual-mode entry point every cron + trigger will call. Path
  A: if the tenant has an active `whatsapp_accounts` (plan Pro +
  within quota), invoke `send-whatsapp` with the approved template
  + ordered variables from `WHATSAPP_TEMPLATES_CATALOG.md`. Path B:
  otherwise (plan Essentiel, or send fails), insert a row in
  `tasks` with template_name + template_params so the agent sees it
  in /tasks and can tap "Open WhatsApp" (wa.me deeplink with
  pre-rendered body). Idempotency built in — crons pass a stable
  `related_id` to avoid duplicate dispatches on re-runs.
- **Not yet wired** to `check-reminders`, `check-payments`,
  `check-reservations`. Waiting until the 10 templates in
  `WHATSAPP_TEMPLATES_CATALOG.md` are approved by Meta — otherwise
  every WhatsApp dispatch would fall through to the task path with
  a "template not found" error, which would noise up /tasks for
  every tenant.

### Documentation (for institutional memory)
- **`META_APP_REVIEW_GUIDE.md`** — full 6-step walkthrough of the
  Meta App Review submission process (business verification,
  dedicated phone + display name, screencast scripts per
  permission, submission forms with pre-written English copy to
  paste into Meta's fields, post-approval flip-to-live).
- **`WHATSAPP_TEMPLATES_CATALOG.md`** — the 10 critical templates
  rewritten as pure Utility (no CTAs, no sales language, no
  promotional emojis) to dodge the Marketing re-categorization
  trap that bit the original `new_lead_notification`. Each
  template ships in a copy-paste block with Meta-submission
  fields + sample variables + CRM data-mapping. Covers the
  client lifecycle: visite (3), dossier (3), paiement (3),
  réservation (1). Submission order + batching strategy spelled
  out.

---

## 🚧 In progress

### Meta — template reviews (pending)
- `nouveau_lead__immo_prox` (founder notification, replaces the
  Marketing-downgraded `new_lead_notification`) — submitted as
  Utility, in review. Expected 1-24h.
- 10 templates from `WHATSAPP_TEMPLATES_CATALOG.md` to be submitted
  one by one (or in batches) by the founder. Review 1-24h each,
  independent / parallelizable.

### Meta — App Review (not submitted yet)
- Business Verification: done ✅
- Dedicated SIM to register as WABA phone number: to buy
- Display Name "IMMO PRO-X" approval: pending on SIM
- App Review submission (2 permissions: `whatsapp_business_messaging`
  + `whatsapp_business_management`): to do after Display Name
- Lead time: 2-8 weeks of Meta back-and-forth
- Full play-by-play in `META_APP_REVIEW_GUIDE.md`

---

## 🧩 Partial / WIP — live code that's NOT fully functional

These features have some infra already built (tables, functions, UI
scaffolding) but are NOT complete end-to-end. Do not assume they work.
If you touch one, either finish it or move it to 🚫 deferred. Never
leave a half-built feature without a note here.

### WhatsApp multi-tenant (Embedded Signup)
- **What exists**: Supabase tables `whatsapp_config`, `whatsapp_accounts`,
  `whatsapp_messages`, `whatsapp_templates`, frozen in
  `016_whatsapp_schema.sql` with the right RLS policies (hardened
  further in 017/018) and updated_at triggers. Edge Functions
  `whatsapp-signup` (OAuth callback) and `send-whatsapp` (send on
  behalf of tenant with quota check). Super Admin page
  `/admin/whatsapp` that displays config/accounts/messages/templates.
  Automation helper `_shared/dispatchAutomation.ts` with
  dual-mode (WhatsApp vs task) dispatch — infrastructure ready,
  not yet wired to crons.
- **What's missing**:
  - `whatsapp_config` row is empty — no Meta app_id / app_secret /
    access_token stored → `send-whatsapp` will 503.
  - No FB Login SDK integration in the tenant-side `/settings` → no
    way for a tenant admin to actually connect their WhatsApp Business
    Account.
  - No Meta App Review submitted → even if the SDK was wired,
    production usage would be blocked.
  - Crons (`check-reminders`, `check-payments`, `check-reservations`)
    not yet calling `dispatchAutomation()`. Blocked on the 10 Utility
    templates being approved by Meta.

### UI wiring for automation tasks (deferred)
- **What exists**: `dispatchAutomation()` falls back to inserting
  rows in `tasks` with `automation_type` + `template_name` +
  `template_params` when the tenant has no active WhatsApp.
- **What's missing**:
  - `/tasks` page doesn't yet badge auto-tasks (🤖 Tâche
    automatique) or offer the "Open WhatsApp deeplink" button —
    so on Essentiel tenants, auto-tasks look like any other
    manual task. UI polish to add once the first cron wires
    actually fire dispatchAutomation.
  - No template-rendering helper on the frontend yet — the
    deeplink needs the rendered message body (template + params
    substituted). Will live in `src/lib/whatsappTemplates.ts`
    once a cron is live to test against.

### CI on GitHub Actions (`.github/workflows/ci.yml`)
- **What exists**: a `build` job that runs on every PR — should run
  `tsc -b --noEmit` + `npm run build`.
- **What's missing**: runners never provision (all PRs show red check
  in 1-2 seconds with 0 steps executed). Needs either an Actions
  billing fix on the GitHub account or migration to a self-hosted
  runner / local git-hook check.

### FTPS fallback deploy (`.github/workflows/deploy.yml`)
- **What exists**: a `workflow_dispatch`-only workflow that can push
  `dist/` to Hostinger via FTPS.
- **What's missing**: `server-dir` assumes
  `/domains/app.immoprox.io/public_html/` — **unverified** against the
  actual Hostinger path. Before using as a real fallback, SSH into the
  Hostinger File Manager and confirm the docroot path.

---

## 🔜 Next up (prioritized)

### 1. Wire the 3 crons to dispatchAutomation (unblocked once templates approved)
Once the 10 templates in `WHATSAPP_TEMPLATES_CATALOG.md` land in
Meta's "Approved" state:
- `check-reminders` → fires `visite_confirmation_j_moins_1` (J-1
  before a planned visit), `visite_rappel_h_moins_2` (2h before),
  `document_rappel_manquant` (doc pending too long).
- `check-payments` → fires `paiement_echeance_j_moins_3` (J-3
  before a due installment), `paiement_retard` (J+1 after unpaid).
- `check-reservations` → fires `reservation_confirmation` when a
  reservation flips to `active`.
- Effort: ~1 day of dev. Mostly plumbing — helpers already exist.

### 2. UI — badge + deeplink for automation tasks
After #1 is live, `/tasks` (and the pipeline client detail tasks
tab) need to visually distinguish auto-tasks:
- 🤖 badge on tasks where `automation_type IS NOT NULL`.
- "Open WhatsApp" button that generates a `wa.me/<phone>?text=...`
  deeplink from the rendered template (using a new
  `src/lib/whatsappTemplates.ts` local map so we don't round-trip
  to Meta just to render a preview).
- Effort: 1-2 days. Blocked on #1 having real data to render.

### 3. Meta — buy SIM + App Review submission
The founder has verified Business Manager ✅, just needs a
dedicated SIM (never used on consumer WhatsApp) to register as the
WABA phone number. Then follow `META_APP_REVIEW_GUIDE.md` Étapes
2-4: Display Name (1-2d), screencast videos, submit for App
Review (2-8 weeks Meta review).

### 4. Embedded Signup — offer WhatsApp to tenants
After Meta approves the app, add a "Connect your WhatsApp" flow in
`/settings/whatsapp`:
- FB Login SDK integrated in the CRM settings page
- Callback lands on the existing `whatsapp-signup` Edge Function
- Tenant's WABA credentials stored in `whatsapp_accounts`
- `send-whatsapp` already supports per-tenant sends via their credentials
- UI for template submission + management per tenant (or curated platform templates)
- Gives tenants the ability to send booking confirmations, reminders, and follow-ups from their own WhatsApp number inside the CRM.

### 5. Pricing + billing page
Once at least 1 tenant is ready to go Pro, publish the pricing on
`immoprox.io` (Essentiel / Pro / Extra packs, as designed in the
2026-04-24 session). Invoicing stays manual (bank transfer) for
Algeria per CLAUDE.md.

### 6. Fix CI / GitHub Actions
`ci.yml` has been failing in 1s on every PR (no runners provisioned).
Check Actions billing / quota, or move to a workflow that doesn't need
a runner (e.g. a pre-merge check that runs locally via a git hook).

---

## 💭 Backlog (nice-to-haves, unsorted)

- **Email drip** when a lead doesn't complete step 2 within 24h
- **Tenant onboarding tour** after first login (once 3-5 tenants are live
  and we see the confusion points)
- **Automated tenant provisioning** — skip the Super Admin click, let
  the lead self-serve their tenant after a demo call; gated by a flag
  the founder toggles per lead.
- **Per-lead UTM tracking + attribution report** in the leads page
- **Super Admin "kill switch" on a tenant** (soft-delete all their data
  on churn) — currently handled manually.
- **Arabic-first landing pages** on marketing side. Content is already
  translated; just needs a language toggle on the marketing HTML.
- **API docs for tenants** if they want to integrate with us (much later).
- **Open-source the marketing site?** Not a priority but the new split
  makes it technically possible since marketing has no secrets.
- **Self-host the Inter font** to kill the Google Fonts dependency + CSP
  hole. Currently allowed in CSP; self-hosting tightens security.
- **Add the `mz-immo.com` domain cleanup** — the user deleted the old
  deployment; confirm no DNS/SSL cert stragglers.

---

## 🚫 Explicitly deferred (not doing unless the landscape changes)

- **Become a formal Meta BSP (Business Solution Provider)**. Reserved
  for Twilio/360dialog-scale operations (months of compliance, revenue
  minimums, 24/7 support). Embedded Signup as a Tech Provider is enough
  for us for the foreseeable future.
- **Self-service signup on the app**. Sales-led is a deliberate choice;
  the marketing/CTA flow funnels everyone through the demo form. Do
  NOT add a `/register` route back.
- **Mobile apps (iOS/Android)**. PWA + mobile web covers the use case.
  Native apps aren't justified until usage patterns demand them.
- **Multi-currency beyond DZD**. We're Algeria-focused. If we expand to
  Morocco/Tunisia, revisit.
- **Stripe/Paddle integration**. Payment collection is manual (bank
  transfer) for the B2B Algerian market. Revisit when cross-border
  payments are a real bottleneck.
- **"Marketing ROI dashboard" for tenants** is already built in
  `src/pages/marketing-roi/`. Kept simple — no A/B testing framework
  yet, deferred until a tenant asks for it.

---

## Ownership

Solo founder (`kardahmed`), AI pair programmer (Claude Code). The user
is non-technical, works primarily from Mac Terminal + Hostinger hPanel
+ GitHub Web + Supabase Dashboard. See `CLAUDE.md` for interaction
guidelines.
