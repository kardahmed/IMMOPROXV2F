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

### A. Webhook entrant WhatsApp (~1 jour)
**But** : capter les réponses des clients dans `whatsapp_messages`
(direction=inbound) pour alimenter l'automation, le score, et l'inbox
tenant.

- Edge Function `whatsapp-webhook` (vérification Meta + endpoint POST)
- Insert dans `whatsapp_messages` avec `direction='inbound'`
- Match `from_phone` → `clients.phone` (jointure tenant-scoped)
- Si pas de match : insertion avec `client_id=NULL` + log pour debug
- Configuration côté Meta (webhook URL + verify token + abonnement
  aux événements `messages` + `message_status`)

### B. Inbox tenant — UI conversations (~2 jours)
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

### C. Idée #1 — boucle tâche ↔ réalité (~2 jours)
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

### D. Idée #2 — score engagement, version SIMPLE (~2 jours)
**But** : pastille couleur sur la liste pipeline pour voir au coup
d'œil qui est chaud / froid. Calculé à partir de 3-5 signaux simples.

- Migration : `clients.engagement_score INT DEFAULT 50`
  + `engagement_updated_at TIMESTAMPTZ`
- Edge Function `recompute-engagement` (cron toutes les 6h) calcule :
  - +20 si réponse WhatsApp dans les 24h après envoi
  - +15 si visite réalisée (pas no-show)
  - −20 si no-show ou délai >7j sans interaction
  - −10 si tâche `auto_cancelled=true` (relance ignorée)
  - decay : −5/semaine sans aucun contact
- UI : pastille couleur (rouge <30, orange 30-60, vert >60) dans
  `TableView.tsx` (pipeline) + détail client
- Note : la version **smart** (ML, comparaison historique, prédiction
  de signature) est en backlog 💭 — à reconsidérer après ~3 mois
  d'usage prod quand on a la data pour calibrer.

### E. Wire 3 crons à dispatchAutomation
*(déjà "Next up #1" — débloqué dès Meta approuve les 10 templates)*

### F. UI badge + deeplink auto-tasks
*(déjà "Next up #2" — dépend de E)*

### G. Meta App Review submission
*(déjà "Next up #3" — externe, attend SIM dédiée)*

### H. Embedded Signup tenant-side
*(déjà "Next up #4" — dépend de G)*

### I. Pricing + billing page
*(déjà "Next up #5")*

### J. CI fix
*(déjà "Next up #6" — non-bloquant)*

### K. Dashboard Unit Economics — `/admin/costs` (~1 jour)
**But** : suivre la rentabilité réelle, pas juste le MRR. Aujourd'hui
`/admin/stats` montre revenue + churn mais ne calcule **pas le profit
net** (manque la soustraction des coûts variables Anthropic / Meta /
Resend / Supabase + coûts fixes).

- Page `/admin/costs` (nav Super Admin) :
  - Section "Coûts fixes mensuels" : formulaire pour saisir
    Supabase, Hostinger, Google Workspace, Sentry, comptable, etc.
    (stocké dans une nouvelle table `platform_costs`).
  - Section "Coûts variables estimés par tenant" : table avec
    revenue (depuis `plan_limits`), coûts variables estimés
    (basés sur quota plan × tarif Meta/Anthropic), **marge brute
    estimée par tenant et par mois**.
  - Section "Profit net plateforme" : MRR (depuis stats) − coûts
    fixes − Σ coûts variables = **profit net mensuel** affiché en
    KPI. Décomposable par mois sur 6 mois glissants.
- Migration : table `platform_costs (id, period TEXT, category TEXT,
  description TEXT, amount_dzd INTEGER, created_at)`.
- Pas de tracking automatique d'usage par tenant pour le MVP — on
  estime depuis les quotas plan. Le tracking précis (`tenant_usage_log`)
  est en backlog 💭.

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
- [ ] **Dashboard Unit Economics live** : `/admin/costs` montre
      profit net mensuel (MRR − coûts fixes − coûts variables) sur
      ≥3 mois consécutifs avec des chiffres validés par le comptable
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

---

## Ownership

Solo founder (`kardahmed`), AI pair programmer (Claude Code). The user
is non-technical, works primarily from Mac Terminal + Hostinger hPanel
+ GitHub Web + Supabase Dashboard. See `CLAUDE.md` for interaction
guidelines.
