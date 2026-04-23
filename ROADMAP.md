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
  frustration, free-text message). Uses the approved
  `new_lead_notification` template (5 body variables). Tested
  end-to-end from `immoprox.io/contact` — both pings land on
  `+213 542 766 068` within ~10 seconds.

---

## 🚧 In progress

### PR #11 — leads page + tenant provisioning from lead
https://github.com/kardahmed/IMMOPROXV2F/pull/11

Waiting for merge + Hostinger auto-redeploy. Everything already passes
local tsc + vite build.

### PR #12 — CLAUDE.md + ROADMAP.md (this file)
https://github.com/kardahmed/IMMOPROXV2F/pull/12

---

## 🧩 Partial / WIP — live code that's NOT fully functional

These features have some infra already built (tables, functions, UI
scaffolding) but are NOT complete end-to-end. Do not assume they work.
If you touch one, either finish it or move it to 🚫 deferred. Never
leave a half-built feature without a note here.

### WhatsApp multi-tenant (Embedded Signup)
- **What exists**: Supabase tables `whatsapp_config`, `whatsapp_accounts`,
  `whatsapp_messages`, `whatsapp_templates`. Edge Functions
  `whatsapp-signup` (OAuth callback) and `send-whatsapp` (send on behalf
  of tenant with quota check). Super Admin page `/admin/whatsapp` that
  displays config/accounts/messages/templates.
- **What's missing**:
  - `whatsapp_config` row is empty — no Meta app_id / app_secret /
    access_token stored → `send-whatsapp` will 503.
  - No FB Login SDK integration in the tenant-side `/settings` → no
    way for a tenant admin to actually connect their WhatsApp Business
    Account.
  - No Meta App Review submitted → even if the SDK was wired,
    production usage would be blocked.
  - The 4 whatsapp tables are NOT in any migration file (created
    directly in Studio). Needs a `016_whatsapp_schema.sql` to freeze
    the schema.

### Password reset
- **What exists**: a "Mot de passe oublie ?" button in `LoginPage.tsx`.
- **What's missing**: `onClick` handler is empty — button does nothing.
  Needs `supabase.auth.resetPasswordForEmail(email)` + an email
  template in Supabase.

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

### 1. Meta WhatsApp App Review
The founder's Meta app is now live with the WhatsApp product (used
already for the lead notification pings). Next step: submit for App
Review to unlock `whatsapp_business_messaging` and
`whatsapp_business_management` permissions in production, beyond the
5-recipient test-mode limit currently in place.
- Lead time: **2-8 weeks** of Meta back-and-forth.
- Unlocks Next #2 when approved.

### 2. Embedded Signup — offer WhatsApp to tenants
After Meta approves the app, add a "Connect your WhatsApp" flow in
`/settings/whatsapp`:
- FB Login SDK integrated in the CRM settings page
- Callback lands on the existing `whatsapp-signup` Edge Function
- Tenant's WABA credentials stored in `whatsapp_accounts`
- `send-whatsapp` already supports per-tenant sends via their credentials
- UI for template submission + management per tenant (or curated platform templates)
- Gives tenants the ability to send booking confirmations, reminders, and follow-ups from their own WhatsApp number inside the CRM.

### 3. Password reset flow
"Mot de passe oublie ?" button on login page is currently inert. Wire to
Supabase password reset email.

### 4. Fix CI / GitHub Actions
`ci.yml` has been failing in 1s on every PR (no runners provisioned).
Check Actions billing / quota, or move to a workflow that doesn't need
a runner (e.g. a pre-merge check that runs locally via a git hook).

### 5. Capture the WhatsApp tables in a migration
Create a new migration (016 or 017) that captures the current schema of
`whatsapp_config`, `whatsapp_accounts`, `whatsapp_messages`,
`whatsapp_templates`. They exist in Supabase but were created in
Studio, so `supabase/migrations/` is incomplete.

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
