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

### Email drip — recover abandoned step-1 leads
- **Migration 026** — `marketing_leads.drip_sent_at TIMESTAMPTZ` + a
  partial index on `(created_at) WHERE step_completed=1 AND drip_sent_at IS NULL`
  so the cron query stays cheap as the table grows.
- **Edge Function `check-abandoned-leads`** — runs hourly. Picks up
  every lead that filled step 1 of `/contact` (name/email/phone) but
  abandoned step 2 for 6+ hours, sends a re-engagement email via
  Resend (template `lead_drip` — short FR copy with a "Terminer ma
  demande" CTA pointing to `https://immoprox.io/contact`), and stamps
  `drip_sent_at` so the same lead is never re-emailed. Skips leads
  already marked `won` or `lost`.
- **Migration 027** — `cron.schedule('check-abandoned-leads-edge')`
  hourly via the existing `call_edge_function()` helper from 013.
- **`lead_drip` template** added to `_shared/email-templates.ts` and
  to `TEMPLATE_META` so it shows up in `/admin/emails`.

### Tenant onboarding — welcome modal
- **Migration 025** — adds `tenants.welcome_modal_seen_at TIMESTAMPTZ`.
  Distinct from the pre-existing `onboarding_completed` boolean (which
  gates the persistent `OnboardingWizard` checklist bar): this column
  tracks the one-shot first-login welcome tour.
- **`WelcomeModal` component** (`src/components/common/WelcomeModal.tsx`)
  — a 4-step carousel shown once to tenant admins on first login,
  explaining pipeline, projects, agents, and settings. Each step has
  a CTA that deep-links to the relevant page and marks the modal seen.
  Dismissable at any step via "Passer l'introduction".
- **Admin-only** (via `useAuthStore().role === 'admin'`) — agents get
  a clean experience from their admin, no CRM intro modal.
- **UTM tracking on `/admin/leads`** — the marketing form already
  captured `utm_source/medium/campaign/referrer/user_agent` via
  `captureTracking()`. The admin page now displays a "Source"
  column (with referrer fallback) and a full "Provenance" section
  in the lead detail modal.

### Phase 6 — plan propagation triggers
- **Migration 024** — two triggers keep `whatsapp_accounts.monthly_quota`
  in sync with the tenant's current plan:
  - `tenants_plan_change_sync` fires on `UPDATE OF plan` — when a
    super admin upgrades/downgrades a tenant, their WhatsApp quota
    is rewritten from `plan_limits.max_whatsapp_messages` (with the
    `-1 → 999999` translation for the unlimited enterprise tier).
  - `plan_limits_quota_sync` fires on `UPDATE OF max_whatsapp_messages`
    — when the super admin tweaks a plan's quota on `/admin/plans`,
    every tenant on that plan gets the new quota instantly.
  - Helper `sync_whatsapp_quota_from_plan(tenant_id)` exposed as
    `SECURITY DEFINER` for manual backfills.
- **Validated 24-Apr-2026**: live test on the enterprise tenant
  flipped enterprise → pro → enterprise, quota propagated correctly
  (999999 → 2000 → 999999). No more manual backfill needed when
  changing a tenant's plan.

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

### WhatsApp inbound webhook + Inbox UI + auto-close loop (25-Apr-2026)
- **Step A — Webhook entrant `whatsapp-webhook`** (PR #46). Edge
  Function with GET handshake + POST event handler. Resolves tenant
  by `metadata.phone_number_id` → `whatsapp_accounts`. Matches
  inbound `from` to `clients.phone` (E.164 with or without `+`).
  Inserts into `whatsapp_messages` with `direction='inbound'`,
  `body_text`, `message_type` (text/image/document/audio/video/
  location/contacts/interactive/reaction/sticker), full
  `raw_payload` preserved. Validated end-to-end on Meta dashboard
  with `phone_number_id=1016951114843105` (test number `+1 555 630
  3754`).
- **Migration 030** — extended `whatsapp_messages` for inbound
  traffic. Adds `direction` (default outbound), `from_phone`,
  `body_text`, `message_type`, `read_at`, `raw_payload`. Relaxes
  `template_name` and `to_phone` to nullable. Status enum
  extended with `'received'`. New indexes for inbox unread
  counter, status lookup by `wa_message_id`, per-client thread.
- **Step B — Inbox UI tenant** (PR #46). Two-pane chat at
  `/inbox`. Conversations grouped by client (or by phone for
  unknown senders). Admin sees all tenant convos, agent sees own
  clients (RLS migration 017 enforces, no UI duplication).
  WhatsApp-style bubbles + delivery status icons + auto-scroll +
  30s poll + sidebar unread badge.
- **Migration 031** — `mark_messages_read(message_ids UUID[])`
  RPC. SECURITY DEFINER function that flips `read_at` on inbound
  messages, re-applying the agent-vs-admin tenant filter
  server-side. Keeps the strict UPDATE policy from migration 017
  (super-admin-only) untouched while letting the inbox UI mark
  conversations as read.
- **Step C — Task ↔ reality auto-close loop** (PR #47). Closes
  the loop end-to-end: agent types in `/inbox` or task detail →
  `send-whatsapp` posts to Meta + stamps `tasks.executed_at` →
  client replies → `whatsapp-webhook` flips the task to `done`
  + writes `client_response` + history row. Zero clicks on the
  agent's side after the initial send. `send-whatsapp` extended
  to support BOTH template mode (existing) and free-form
  `body_text` mode (new, replies within 24h conversation
  window). New "Envoyer via CRM" button (green filled) on
  WhatsApp tasks in `TaskDetailModal`, alongside the existing
  "Ouvrir WhatsApp" deeplink (kept as Essentiel fallback).

### Hostinger build unblocked (25-Apr-2026, PR #46)
- Root cause: `src/types/database.ts` was a hand-maintained
  Database type that the supabase client used. It had drifted
  massively (missing 18 columns from migration 028 on `tasks`,
  missing `welcome_modal_seen_at` / `plan` on `tenants`, no
  whatsapp_* tables). PR #45's regen of `database.generated.ts`
  was correct but never wired in. Hostinger was therefore
  red-failing every merge to `main` since 24-Apr (PRs #38–#45).
- Fix: replace `database.ts` with a re-export of `Database`
  from `database.generated.ts`. All hand-curated UNION types
  (PipelineStage, ClientSource, GoalMetric, etc.) stay below
  since they're used as labels/badges throughout the UI.
- Knock-on fixes (15 files): the stricter generated types
  surfaced pre-existing nullable bugs that the loose manual
  types had hidden. Mostly `new Date(maybeNull)` → `new Date(x
  ?? 0)` and ClientInfo / KanbanCardClient interfaces
  realigned. `useEmailLogs` realigned to actual schema
  (`template_slug` / `to_email` / `error_message` instead of
  the never-existed `template` / `recipient` / `provider`).

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

## 🎯 MVP closure plan — features bloquantes avant d'arrêter le dev produit

Tout ce qui doit être livré pour passer en mode go-to-market. Les
items A → D sont nouveaux ; E → J sont les anciens "Next up"
ré-ordonnés ; K est nouveau (cost tracking). Effort total estimé :
**~8 jours de dev** pour A+B+C+D+K, le reste dépend de Meta.

**État au 26-Apr-2026** : ✅ A, B, C, D, K livrés (PRs #46–#51). I retiré
(modèle sales-led — pas de pricing public). 🔜 J seul reste non bloqué
par Meta. E, F, G, H bloqués par approval Meta (templates + App Review).

### ✅ A. Webhook entrant WhatsApp (~1 jour) — LIVRÉ (PR #46)
**But** : capter les réponses des clients dans `whatsapp_messages`
(direction=inbound) pour alimenter l'automation, le score, et l'inbox
tenant.

- Edge Function `whatsapp-webhook` (vérification Meta + endpoint POST)
- Insert dans `whatsapp_messages` avec `direction='inbound'`
- Match `from_phone` → `clients.phone` (jointure tenant-scoped)
- Si pas de match : insertion avec `client_id=NULL` + log pour debug
- Configuration côté Meta (webhook URL + verify token + abonnement
  aux événements `messages` + `message_status`)

### ✅ B. Inbox tenant — UI conversations (~2 jours) — LIVRÉ (PR #46)
**But** : que l'admin tenant voie tous les échanges WhatsApp de ses
agents (oversight) et que chaque agent voit uniquement les siens.
Sécurité déjà gérée par RLS migration 017 — il reste l'UI.

- Page `/messages` (onglet sidebar, gated tenant) :
  - Liste des conversations regroupées par client
  - Filtres : agent, période, statut (lu / non lu)
  - Compteur "non lus" sur l'icône sidebar
  - Admin tenant → voit toutes les convos. Agent → voit les siennes
    (RLS migration 017 fait le filtre, pas de logique UI à dupliquer)
- Vue conversation threadée par client :
  - Bulles entrantes/sortantes type WhatsApp
  - Affichage timestamp, agent émetteur, statut delivery (sent/delivered/read)
  - Champ d'envoi rapide (réutilise `send-whatsapp` Edge Function)
- Onglet "Messages" sur la fiche client (mêmes données, focus 1 client)
- Marquage "lu" : table `whatsapp_messages.read_at` (migration mineure)

### ✅ C. Idée #1 — boucle tâche ↔ réalité (~2 jours) — LIVRÉ (PR #47, sauf cron 48h)
**But** : que le statut des tâches reflète la réalité automatiquement.
Dépend de A.

- Bouton "Envoyer via CRM" sur chaque tâche WhatsApp → appelle
  `send-whatsapp` + écrit `executed_at = now()` sur la tâche
- Handler dans le webhook (A) : si une tâche du même client est
  `pending` + `executed_at IS NOT NULL` + `auto_cancelled IS NOT TRUE`
  → flip `status='done'` + `completed_at = now()` + insertion history
- Cron `tasks_no_reply_48h` (toutes les heures) : pour chaque tâche
  `executed_at` > 48h, sans réponse client entre-temps → crée une
  tâche de relance + suggère un autre canal (`channel='call'` si
  WhatsApp non répondu)

### ✅ D. Idée #2 — score engagement, version SIMPLE (~2 jours) — LIVRÉ (PR #50)
**But** : pastille couleur sur la liste pipeline pour voir au coup
d'œil qui est chaud / froid. Calculé à partir de 3-5 signaux simples.

- Migration 033 : `clients.engagement_score INT DEFAULT 50`
  + `engagement_updated_at TIMESTAMPTZ` + cron `recompute-engagement-6h`
- Edge Function `recompute-engagement` (cron toutes les 6h) :
  - +20 si réponse WhatsApp récente, +15 par visite réalisée
  - −20 si silence 14j, −10 par tâche `auto_cancelled=true`
- UI : `<EngagementBadge />` (pastille rouge/orange/vert) dans
  `TableView.tsx` (colonne Score) + header de `ClientDetailPage.tsx`
- Note : la version **smart** (ML, comparaison historique, prédiction
  de signature) est en backlog 💭 — à reconsidérer après ~3 mois
  d'usage prod quand on a la data pour calibrer.

### E. Wire 3 crons à dispatchAutomation (~1 jour)
**But** : déclencher les rappels WhatsApp automatiques quand les
templates sont approuvés. Bloqué tant que les 10 templates de
`WHATSAPP_TEMPLATES_CATALOG.md` ne sont pas en statut "Approved" chez
Meta — sinon chaque dispatch fallback en task avec erreur "template
not found", ce qui pollue `/tasks` pour tous les tenants.

- `check-reminders` → fires `visite_confirmation_j_moins_1` (J-1
  avant visite planifiée), `visite_rappel_h_moins_2` (H-2),
  `document_rappel_manquant` (doc en attente trop longtemps).
- `check-payments` → fires `paiement_echeance_j_moins_3` (J-3 avant
  échéance), `paiement_retard` (J+1 après impayé).
- `check-reservations` → fires `reservation_confirmation` quand une
  réservation passe en `active`.
- Mostly plumbing — les helpers existent déjà (`dispatchAutomation`).

### F. UI badge + deeplink auto-tasks (~1 jour)
**But** : sur les tenants Essentiel (sans WhatsApp API), les tâches
auto-générées par les crons doivent être visuellement distinguables
des tâches manuelles + offrir un bouton "Open WhatsApp" qui pré-
remplit le message dans l'app WhatsApp de l'agent.

- Badge 🤖 sur les tâches où `automation_type IS NOT NULL`
- Bouton "Open WhatsApp" qui génère un `wa.me/<phone>?text=<rendered>`
  depuis le template + variables (helper local
  `src/lib/whatsappTemplates.ts` pour rendre côté frontend, sans
  round-trip Meta).
- Dépend de E pour avoir des données réelles à afficher.

### G. Meta App Review submission (externe — attend SIM)
**But** : faire approuver l'app par Meta avec les 2 permissions
`whatsapp_business_messaging` + `whatsapp_business_management` pour
débloquer Embedded Signup tenant-side.

- Business Verification : ✅ déjà fait
- Achat SIM dédiée → activation Display Name "IMMO PRO-X" (1-2j)
- Préparer screencasts vidéo selon `META_APP_REVIEW_GUIDE.md`
  Étapes 2-4
- Submit App Review (queue Meta : 2-8 semaines)
- 🔴 **Le plus gros bloqueur calendaire du projet**

### H. Embedded Signup tenant-side (~1-2 jours)
**But** : permettre à chaque tenant de connecter SA propre WhatsApp
Business depuis `/settings/whatsapp` via OAuth Facebook. Bloqué tant
que G n'est pas approved.

- FB Login SDK intégré dans la page Settings
- Callback OAuth atteint l'Edge Function `whatsapp-signup` existante
- Credentials WABA du tenant stockés dans `whatsapp_accounts`
- `send-whatsapp` envoie déjà depuis le `access_token` du tenant —
  rien à changer là
- UI pour gérer les templates : catalogue partagé pour
  Essentiel/Pro, builder custom pour Extra (cf backlog Approche C)

### ❌ I. Pricing + billing page publique — HORS SCOPE (modèle sales-led)
**Décision (26-Apr-2026)** : pas de pricing page publique. Le marché
algérien fonctionne en sales-led — la valeur perçue se construit
pendant la présentation perso, et un prix public hors contexte est
systématiquement perçu comme "trop cher". Le prix est annoncé à la
fin du pitch, après la démo. Conséquence : `immoprox.io` reste un
site de capture de leads (formulaire demo), pas une vitrine tarifaire.

### J. CI fix (~½ jour, non-bloquant)
**But** : que `ci.yml` arrête de fail rouge sur chaque PR.

- Vérifier billing / quota Actions (probablement le souci)
- Ou migrer vers un pre-merge git hook local qui run
  `tsc --noEmit` + `npm run build`
- Pre-existing depuis avril 2026, safe to merge red en attendant

### ✅ K. Dashboard Unit Economics — `/admin/costs` (~1 jour) — LIVRÉ (PR #51)
**But** : suivre la rentabilité réelle, pas juste le MRR.

- Migration 034 : table `api_costs` (tenant_id, service, operation,
  units, cost_da, metadata, created_at) + RPC `get_costs_summary(start,
  end)` qui retourne JSON (revenue, costs_by_service, profit, marge,
  top tenants, série quotidienne).
- Tracking auto via shared helper `_shared/trackCost.ts`, branché dans
  `generate-call-script`, `ai-suggestions`, `send-email`,
  `send-campaign`, `send-whatsapp`. Une ligne par appel API réussi.
- Coûts en DZD à 140 DA/USD (Claude Haiku 4.5 input/output, Resend par
  email, WhatsApp par message). Supabase Pro = 3500 DA/mo fixe pro-raté.
- UI `/admin/costs` :
  - 4 KPIs : Revenu actif, Coûts API, Profit, Marge %
  - Breakdown Anthropic / Resend / WhatsApp / Supabase (4 cartes)
  - Graphe AreaChart 7/30/90 jours (toggle)
  - Top 5 tenants par coût avec profit calculé
- RLS : `api_costs` lisible super_admin only ; `service_insert` libre
  (les Edge Functions y écrivent en service-role).
- Tarifs hardcodés dans `trackCost.ts` — à recalibrer quand les
  premières factures Anthropic/Meta/Resend tombent (post-MVP).

---

## 🏁 Definition of Done — critères pour dire "on arrête le dev"

Quand tous ces critères sont 🟢, on passe en mode go-to-market et le
dev produit s'arrête (sauf bug fixes) :

- [ ] **1 tenant Pro live** avec WhatsApp connecté via Embedded Signup
      et utilisé quotidiennement
- [ ] **Webhook entrant fonctionnel** : ≥10 réponses clients capturées
      automatiquement dans `whatsapp_messages` direction=inbound sur 7j
- [ ] **Inbox tenant fonctionnel** : page `/messages` live, admin
      voit toutes les convos du tenant, agents voient les leurs (RLS),
      ≥1 admin l'utilise pour superviser ≥1 agent sur 7j
- [ ] **Auto-close des tâches** : ≥5 tâches passées de pending → done
      automatiquement via réponse client (sans clic agent) sur 7j
- [ ] **Score engagement** : valeur recalculée pour 100% des clients
      actifs, affichée dans `TableView`, ≥1 agent l'utilise comme
      filtre de tri
- [ ] **3 crons WhatsApp opérationnels** (`check-reminders`,
      `check-payments`, `check-reservations`) avec ≥3 dispatches
      réussis chacun
- [x] **Dashboard Unit Economics live** : `/admin/costs` montre
      profit net mensuel (MRR − coûts API − Supabase) — livré PR #51,
      à valider sur ≥3 mois consécutifs avec le comptable une fois en
      prod réelle
- [ ] **0 bug critique ouvert** (pas de bloquant, pas de data loss)
- [ ] **ROADMAP 🚧 In progress vide**, 🧩 Partial vide ou converti
      en 🚫 Deferred avec justification

---

## 💰 Pricing & Unit Economics

Toutes les valeurs sont calculées au **cours parallèle DZD/USD = 250**
(c'est le taux d'achat réel de l'USD pour payer les fournisseurs
étrangers Anthropic / Meta / Supabase / Hostinger). Référence WhatsApp
basée sur les tarifs Wati + tarifs Meta directs zone MENA.

### Grille des 3 plans

| Item | 🟢 Essentiel | 🔵 Pro | 🟣 Extra |
|---|:-:|:-:|:-:|
| Prix mensuel DZD | **28,000** | **75,000** | **180,000** |
| Équivalent USD parallèle | $112 | $300 | $720 |
| Users inclus | 4 | 15 | illimité |
| Clients actifs | 300 | 2,000 | illimité |
| Projets | 3 | 10 | illimité |
| Stockage | 500 MB | 5 GB | 50 GB |
| Landing pages | 1 | 5 | illimité |
| Email campagnes/mois | 200 | 2,000 | illimité |
| WhatsApp API (numéro dédié) | ❌ | ✅ | ✅ |
| WhatsApp utility/mois inclus | 0 | 3,000 | 25,000 (cap fair-use) |
| WhatsApp marketing/mois inclus | 0 | 500 | 5,000 (cap fair-use) |
| Inbox tenant (admin voit tout) | ❌ | ✅ | ✅ |
| Auto-rappels (visites/paiements/réservations) | ❌ | ✅ | ✅ |
| Auto-close tâches sur réponse | ❌ | ✅ | ✅ |
| Score engagement | ❌ | ✅ basique | ✅ + smart (futur) |
| IA scripts d'appel | ❌ | ✅ | ✅ |
| IA matching unités | ❌ | ✅ | ✅ |
| IA documents auto | ❌ | ❌ | ✅ |
| IA prompts custom | ❌ | ❌ | ✅ |
| **Templates WhatsApp personnalisables** (builder full custom) | ❌ | ❌ | ✅ |
| Catalogue 10 templates pré-rédigés (avec variables agence) | ✅ | ✅ | ✅ |
| Marketing ROI | ❌ | ✅ | ✅ |
| Goals + Performance | ❌ | ✅ | ✅ |
| Custom branding | ❌ | ❌ | ✅ |
| API + webhooks | ❌ | ❌ | ✅ |
| Support | Email | Email + WA | Dédié + onboarding |

### Surconsommation (overage) — au-delà du quota
- WhatsApp utility supplémentaire : **12 DZD/msg** (markup ~50% sur Meta)
- WhatsApp marketing supplémentaire : **30 DZD/msg**
- WhatsApp authentification : **10 DZD/msg**
- User additionnel Essentiel : **6,000 DZD/user/mois**
- User additionnel Pro : **4,500 DZD/user/mois**

### Coûts Meta WhatsApp (référence brute, zone MENA)
- Utility : ~$0.033/conversation = ~8 DZD parallèle
- Marketing : ~$0.082/conversation = ~20 DZD parallèle
- Auth : ~$0.028/conversation = ~7 DZD parallèle
- Service (réponse <24h) : 1,000 free/mois puis ~8 DZD/conv

### Marges par tenant (gross margin)

| Plan | Revenu | Coûts variables (worst case) | Marge brute | % |
|---|---|---|---|---|
| Essentiel | 28,000 | ~550 (DB + emails seulement) | 27,450 | **98%** 💎 |
| Pro | 75,000 | ~38,250 (3k utility + 500 marketing + IA + DB) | 36,750 | **49%** ✅ |
| Extra (cap fair-use) | 180,000 | ~110,000 (15k utility + 2k marketing + IA + DB) | 70,000 | **39%** 🟡 |

⚠️ **Extra** doit être **cappé en fair-use** (15k utility + 2k marketing
inclus) sinon le tenant peut consommer pour $1,300+/mois ($595 de perte
par mois). Au-delà du cap → overage facturé.

### Coûts fixes plateforme (peu importe nb tenants)

| Item | DZD/mois |
|---|---|
| Supabase Pro | 6,250 |
| Hostinger Premium | 1,000 |
| Domain immoprox.io | 375 |
| Google Workspace email pro | 1,500 |
| Resend Free (3k emails inclus) | 0 |
| GitHub Free | 0 |
| Sentry monitoring (recommandé) | 6,500 |
| Cal.com (optionnel) | 3,000 |
| **Total minimum** | **~9,125** |
| **Total recommandé** | **~18,625** |

### Coûts opérationnels mensuels

| Item | DZD/mois |
|---|---|
| Comptable (cabinet ou indépendant) | 30,000 - 50,000 |
| Frais bancaires pro | 1,500 - 3,000 |
| Internet fibre pro | 5,000 |
| Téléphone pro | 2,500 |
| Loyer bureau (si applicable) | 0 - 30,000 |
| Frais remittance (~5% des paiements USD) | variable |
| **Total opérationnel** | **~39,000 - 90,500** |

### Coûts one-shot (lancement)

| Item | DZD |
|---|---|
| Création SARL/EURL | 150,000 - 300,000 |
| Inscription comptable | 20,000 |
| Ouverture compte bancaire pro | 10,000 |
| Carte CIB Internationale | 3,000 |
| SIM dédiée WhatsApp Business | 5,000 |
| Marketing initial (cartes, brochures) | 50,000 |
| Branding (logo HD, screenshots) | 30,000 |
| **Total lancement** | **~268,000 - 418,000** |

### Charges fiscales Algérie

| Taxe | Taux | Base |
|---|---|---|
| TVA | 19% | Sur prix HT |
| TAP (Taxe Activité Pro) | 2% | Sur CA mensuel |
| IBS (Impôt Bénéfices Sociétés) | 19% | Sur bénéfice net annuel (si SARL/EURL) |
| IRG | 0-35% progressif | Si EURL personne physique |

→ Décision marketing : afficher **TTC** (plus lisible B2B Algérie)
plutôt que HT.

### Break-even & projections

| Scénario | Composition | Revenu | Coût total | Profit avant impôts |
|---|---|---|---|---|
| Early (2 tenants) | 1 Essentiel + 1 Pro | 103,000 | 97,425 | **+5,575** 🟡 |
| Croissance (5 tenants) | 3 Essentiel + 2 Pro | 234,000 | 136,775 | **+97,225** ✅ |
| Cible 6 mois (10 tenants) | 5 Essentiel + 5 Pro | 515,000 | 254,125 | **+260,875** ✅✅ |
| Cible 12 mois (20 tenants) | 10 Essentiel + 10 Pro | 1,030,000 | 449,625 | **+580,375** ✅✅✅ |

→ **Break-even atteint à 3 tenants**. Salaire confortable à 10
tenants Pro mix (~260k DZD/mois avant impôts ≈ $1,040 USD).

---

## ⚠️ Risques majeurs & plans B

### Risque #1 — Meta App Review refuse ou prend >3 mois 🔴
**Probabilité** : moyenne. Meta est notoirement strict sur les
catégorisations Marketing vs Utility et la qualité des screencasts.
Le founder a déjà eu un template re-categorized par Meta (cf section
Done > Backend ci-dessus).

**Impact** : sans Meta App Review approuvé, l'Embedded Signup
tenant-side n'est pas utilisable → les tenants ne peuvent pas
connecter leur propre WhatsApp Business → le plan Pro perd son
différentiateur principal.

**Plan B (si Meta refuse ou délai >3 mois)** :
1. **Plan Pro fallback** : on continue avec `dispatchAutomation` qui
   tombe dans la branche "task" (pas WhatsApp direct). Le tenant
   reçoit la tâche dans `/tasks` avec un bouton "Open WhatsApp
   deeplink" qui ouvre `wa.me/<phone>?text=<rendered>` → l'agent
   envoie depuis SON WhatsApp perso. Pas d'auto-rappels temps réel,
   mais 80% de la valeur est conservée.
2. **Pricing revu** : Pro descend à **45,000 DZD/mois** (vs 75,000)
   tant que l'API n'est pas dispo. On positionne comme "early bird"
   en attendant l'activation auto.
3. **Communication** : être transparent avec les premiers tenants
   ("API en cours d'activation Meta, en attendant vous envoyez en
   1 clic depuis votre tel"). La plupart des agences algériennes
   utilisent déjà WhatsApp Business sur tel — c'est pas un drame.
4. **Re-soumission** : ré-essayer App Review tous les 1-2 mois en
   ajustant la documentation jusqu'à approbation.

### Risque #2 — Cours parallèle DZD/USD se dégrade
**Probabilité** : forte (historiquement ~10% par an).

**Impact** : nos coûts USD (Anthropic, Meta, Supabase) montent
mécaniquement → marges Pro/Extra se compriment.

**Plan B** : ajustement annuel automatique des prix (+10% par
an indexé sur taux parallèle). Documenté dans les CGU.

### Risque #3 — Plus de 3 tenants Extra qui consomment fair-use max
**Probabilité** : faible mais possible si tenants enthousiastes.

**Impact** : marge Extra à 39% peut tomber à <20% si tous max-out.

**Plan B** : déjà mitigé par le cap fair-use (15k utility + 2k
marketing). Au-delà → overage automatique.

### Risque #4 — Anthropic/Meta change ses tarifs
**Probabilité** : faible court-terme, modérée long-terme.

**Impact** : recalcul de la grille pricing.

**Plan B** : mécanisme d'ajustement annuel + clause CGU permettant
modification avec préavis 30j.

### Risque #5 — 1 tenant Pro représente >40% du MRR
**Probabilité** : modérée en early stage.

**Impact** : si ce tenant churn, MRR s'effondre.

**Plan B** : objectif diversification — pas plus de 25% du MRR
sur 1 tenant à partir de 5 tenants signés. Refuser nouveaux Extra
si ça déséquilibre trop.

### Risque #6 — Régulation algérienne change sur SaaS B2B
**Probabilité** : faible court-terme.

**Impact** : nouveaux frais ou contraintes (ex: hébergement local
obligatoire, taxe sur services numériques).

**Plan B** : suivre l'actualité réglementaire via le comptable +
chambre de commerce. Pas d'action préventive.

---

## 🚀 Plan d'exécution — séquence opérationnelle complète

État au **2026-04-25** : repo nettoyé (34 branches mergées + dangereuse
supprimées), refactor tasks consolidé (PRs #42-#45), ROADMAP finalisé
avec MVP closure plan + pricing + risques. SIM Meta pas encore achetée
→ on est au point de départ Phase A.

Légende acteurs : 👨‍💼 Founder · 🤖 Claude (dev) · 🏢 Meta · 🏪 Tenant

### Phase A — Setup Meta (1-2 semaines après achat SIM)

| # | Étape | Acteur | Durée | Bloque |
|---|---|---|---|---|
| A1 | Acheter SIM dédiée (jamais utilisée WhatsApp consumer) | 👨‍💼 | 1-3j | TOUT |
| A2 | Activer SIM + tester réception SMS | 👨‍💼 | 30min | A3 |
| A3 | Soumettre Display Name "IMMO PRO-X" | 👨‍💼 | 30min + 1-2j review | A8 |
| A4 | Préparer 10 templates depuis `WHATSAPP_TEMPLATES_CATALOG.md` | 👨‍💼 | 1h | — |
| A5 | Soumettre 10 templates à Meta (3-4/jour, étalé sur 3j) | 👨‍💼 | 3j × 30min | E |
| A6 | Stocker access_token permanent dans `whatsapp_config` (System User Business Settings) | 👨‍💼 | 15min | F, H |
| A7 | Enregistrer screencasts pour App Review (selon `META_APP_REVIEW_GUIDE.md`) | 👨‍💼 | 4-6h | A8 |
| A8 | Submit App Review (`whatsapp_business_messaging` + `_management`) | 👨‍💼 | 1h | H |

**Coûts Phase A** : ~15,000 DZD (SIM + 1 mois abonnement)

### Phase B — Dev parallèle (peut démarrer **MAINTENANT**, ~8 jours)

Ces étapes ne dépendent pas de Meta. On code pendant que Phase A tourne.

| # MVP | Étape | Acteur | Durée | Dépendance | État |
|---|---|---|---|---|---|
| **A** | Webhook entrant `whatsapp-webhook` | 🤖 | 1j | aucune | ✅ PR #46 |
| **B** | Inbox UI tenant `/inbox` | 🤖 | 2j | aucune (RLS déjà OK migration 017) | ✅ PR #46 |
| **C** | Boucle tâche↔réalité | 🤖 | 2j | A | ✅ PR #47 (cron 48h reporté) |
| **K** | Dashboard `/admin/costs` | 🤖 | 1j | aucune | 🔜 next |
| **D** | Score engagement simple | 🤖 | 2j | A (signaux replies) | 🔜 next |

À chaque étape : déployer + valider sur staging avec ton tenant
existant + faux clients de test.

### Phase C — Attente Meta App Review (2-8 semaines)

Pas grand-chose à coder. Activités possibles :

| # | Étape | Acteur | Note |
|---|---|---|---|
| C1 | Tester en plan B avec deeplink | 👨‍💼 + 🤖 | Onboarder 1-2 tenants pilotes en mode dégradé, Pro à 45k early bird |
| C2 | Valider templates approuvés par Meta | 👨‍💼 + 🏢 | Re-soumettre les rejets ajustés |
| C3 | Surveiller App Review status (queue Meta) | 👨‍💼 | Notifications email Meta |
| C4 | Travailler `/admin/costs` avec vrais chiffres | 👨‍💼 + 🤖 | Saisie manuelle + ajustement |
| C5 | Préparer pricing page `immoprox.io` (Étape I) | 👨‍💼 + 🤖 | Pas bloquant, peut être fait |

### Phase D — Activation API (1-2 semaines après App Review approved)

| # | Étape | Acteur | Durée |
|---|---|---|---|
| **E** | Wire 3 crons à `dispatchAutomation` | 🤖 | 1j |
| **F** | UI badge + deeplink auto-tasks | 🤖 | 1j |
| **H** | Embedded Signup tenant `/settings/whatsapp` | 🤖 | 1-2j |
| D4 | Test E2E avec 1 tenant pilote (Embedded Signup → 1er rappel auto) | 👨‍💼 + 🏪 | 3-5j |
| D5 | Migration tenants pilotes plan B → plan A (passer à 75k Pro standard) | 👨‍💼 + 🏪 | 1j de comm |

### Phase E — Go-live progressif (3 mois)

| # | Étape | Acteur | Cible |
|---|---|---|---|
| E1 | Onboarder 3-5 tenants Pro depuis leads existants `/admin/leads` | 👨‍💼 | 3 tenants signés mois 1 |
| E2 | Itérer sur retours pilotes (bugs, UX, demandes feature) | 👨‍💼 + 🤖 | Hot-fixes uniquement |
| E3 | Activer J. CI fix si Actions enfin disponibles | 🤖 | Non-bloquant |
| E4 | Marketing organique : témoignages tenants pilotes | 👨‍💼 | Sur landing pages |
| E5 | Atteindre Definition of Done | 👨‍💼 + 🤖 | 10 tenants Pro mix mois 3 |
| E6 | **Stop dev produit** — passer en mode go-to-market | 👨‍💼 | Maintenance + support |

### Décisions à prendre **avant Phase A** (cette semaine)

- [ ] **Quand acheter la SIM ?** Idéalement cette semaine
- [ ] **Pricing TVA inclusive ou exclusive ?** Reco : **TTC** (lisible B2B Algérie)
- [ ] **Setup fee one-shot pour Pro/Extra ?** Reco : **+50,000 DZD** pour onboarding personnalisé
- [ ] **Plan Extra à 180k ou Sur devis ?** Reco : **Sur devis** au début (1er Extra signé déclenche le builder Approche C)
- [ ] **Comptable identifié ?** Si non, démarrer recherche en parallèle de Phase A
- [ ] **Compte bancaire pro + Carte CIB Internationale ?** Si non, lancer démarche en parallèle

### Décisions à prendre **avant Phase B** (avant dev)

- [ ] **A en premier ou B en premier ?** Reco : **A** d'abord (le webhook débloque C et D)
- [ ] **Test sur ton tenant existant ou tenant pilote dédié ?** Reco : **tenant pilote dédié**
- [ ] **Valider nouveaux prix dans `/admin/plans`** (Essentiel 28k / Pro 75k / Extra Sur devis)
- [ ] **Migration `starter`→`essentiel` + `enterprise`→`extra`** ? Ou via UI ?

---

## 📋 WhatsApp Go-Live Checklist — récap exhaustif

### Côté Meta (👨‍💼 toi)
- [ ] **W1.** Acheter SIM dédiée
- [ ] **W2.** Display Name "IMMO PRO-X" approuvé
- [ ] **W3.** Soumettre 10 templates (`WHATSAPP_TEMPLATES_CATALOG.md`)
- [ ] **W4.** App Review approved (`whatsapp_business_messaging` + `_management`)

### Côté dev (🤖 moi)
- [x] **W5.** Étape A — Webhook entrant `whatsapp-webhook` ✅ PR #46
- [x] **W6.** Étape B — Inbox UI tenant `/inbox` ✅ PR #46
- [x] **W7.** Étape C — Boucle tâche↔réalité ✅ PR #47 (cron 48h reporté)
- [ ] **W8.** Étape E — Wire 3 crons à `dispatchAutomation`
- [ ] **W9.** Étape F — UI badge auto-tasks
- [ ] **W10.** Étape H — Embedded Signup tenant `/settings/whatsapp`
- [ ] **W11.** Stocker `whatsapp_config` row (app_id + secret + token permanent)

### Per-tenant onboarding (🏪 chaque agence cliente, guidée par notre wizard)
- [ ] T1. Connexion Facebook Business Manager (via OAuth Embedded Signup)
- [ ] T2. Vérification entreprise auprès de Meta (registre commerce)
- [ ] T3. Soumettre Display Name agence (ex: "Agence El-Oued")
- [ ] T4. Activer numéro WhatsApp Business dédié
- [ ] T5. Sélectionner les templates du catalogue à utiliser

### Tech Provider model — argument commercial
- ✅ Chaque tenant garde son identité 100% (numéro + nom + logo agence)
- ✅ Le client final voit "Agence El-Oued", **JAMAIS "IMMO PRO-X"**
- ✅ Variables auto-remplies (nom client, date visite, montant, etc.)
- ⏳ Templates wording custom = exclusivité Extra tier (Approche C en backlog)

---

## 💭 Backlog (nice-to-haves, unsorted)

- **Tenant template builder (Extra-tier exclusive)** — UI complet dans
  `/settings/whatsapp/templates` pour que les tenants Extra créent
  leurs propres templates WhatsApp from scratch. Tabs : "Catalogue
  partagé" (10 templates pré-rédigés, dispo pour tous les plans) et
  "Mes templates" (custom, Extra uniquement). Editeur visuel : header
  (text/image/video), body avec variables `{{n}}`, footer, boutons CTA.
  Soumission à Meta via Edge Function `submit-whatsapp-template` (utilise
  l'`access_token` du tenant). Webhook listen `template_status_update`
  pour tracker approval/rejection en temps réel dans l'UI.
  Migration nécessaire :
  ```
  ALTER TABLE whatsapp_templates
    ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    ADD COLUMN parent_template_id UUID REFERENCES whatsapp_templates(id),
    ADD COLUMN meta_template_id TEXT,
    DROP CONSTRAINT IF EXISTS whatsapp_templates_name_key,
    ADD CONSTRAINT unique_name_per_tenant UNIQUE (tenant_id, name);
  ```
  `tenant_id NULL` = template platform partagé. Effort : ~1 semaine
  (migration + UI builder + Edge Function + webhook handler).
  **Déclencheur** : 1er tenant Extra signe. Avant ça, Extra est vendu
  avec promesse "Templates custom à venir" + accès anticipé.
- **Smart engagement score (ML version)** — successor to the simple
  rule-based score from MVP closure plan section C. Compares the live
  client's signal pattern against historical clients who signed vs
  churned, weights signals dynamically per tenant, predicts probability
  of signature. Needs ~3 months of prod data to calibrate. Effort:
  ~1-2 weeks once data is there. Reconsider only after the simple score
  is shipped and used.
- **Sequence builder** (idea #3 from the 25-Apr-2026 brainstorm) —
  drag-drop UI for tenants to define multi-step automation flows
  ("J+0 WhatsApp, J+1 SMS si pas de réponse, J+3 appel, J+7 marquer
  froid"). Effort: ~2-3 days. Deferred until A/B/C from MVP closure
  plan are in production and we see real friction.
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
- **Custom domain per tenant for landing pages** (`landing.monagence.com`
  → tenant's pages). UI was live in `/admin/tenants/:id` but the
  feature was end-to-end broken: no UNIQUE constraint, no format
  validation, RLS blocked anonymous lookup, Hostinger had no parked-
  domain config, no Let's Encrypt provisioning, no DNS verification.
  Removed from UI on 26-Apr-2026 (tenants couldn't actually use it
  and a saved value caused an infinite loader on `/p/:slug`). The
  `tenants.custom_domain` column is kept in the DB (non-blocking) for
  future re-enable. Public landings stay accessible via
  `app.immoprox.io/p/:slug`. Re-enable only when there's tenant demand
  AND we're ready to do the full backend work (RLS public-read policy,
  format/uniqueness, Hostinger alias domain + SSL automation).
- **Offline-first with CRDT sync (Level 4 — Notion/Linear style)**.
  Discussed 26-Apr-2026, deliberately deferred. Levels 1-3 of offline
  support cover 95% of the field-agent use case: Level 1 (static
  asset cache via SW) is shipped; Level 2 (read-only persisted React
  Query cache) is on deck if/when needed; Level 3 (mutation queue
  with last-write-wins sync on reconnect) is ~1-2 days when a tenant
  actually asks for offline writes. Level 4 (true CRDT with conflict
  resolution) was estimated at 6-10 weeks of solo work and rejected
  because:
  - Forces a data-layer rewrite (Replicache / PowerSync / Yjs +
    custom backend), losing all React Query / Supabase RLS
    integration we currently rely on.
  - Re-implements security at the sync layer instead of using
    Supabase RLS — significant tenant-isolation risk.
  - Requires conflict-resolution UI for non-technical users, which
    Notion has 15 designers for.
  - Triples test surface (online normal / offline queued / sync
    conflict) for every future feature, dropping dev velocity 30-50%
    permanently.
  - Replicache pricing: $499-$5000/month; PowerSync free tier exists
    but enterprise features paid. DIY = becoming a database engineer
    full-time.
  - Reversal cost is ~3 months of refactor — effectively a one-way
    door at our stage.
  Revisit only when ALL of these are true: ≥20 paying tenants
  explicitly demand multi-day offline, a 2nd dev specialised in
  data engineering is on board, the product pivots toward
  collaborative multi-user real-time editing (Figma-style). Until
  then Level 2 → Level 3 is the right gradient.

---

## Ownership

Solo founder (`kardahmed`), AI pair programmer (Claude Code). The user
is non-technical, works primarily from Mac Terminal + Hostinger hPanel
+ GitHub Web + Supabase Dashboard. See `CLAUDE.md` for interaction
guidelines.
