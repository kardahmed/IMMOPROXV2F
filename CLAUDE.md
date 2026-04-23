# CLAUDE.md

This file is Claude Code's primary briefing. It's auto-loaded at the
start of every session, so anything written here is context that
doesn't need to be re-explained.

When updating the project: **also update `ROADMAP.md`** to reflect what
changed. Keep this file for *stable* facts (architecture, conventions).
Put *evolving* things (priorities, current work) in ROADMAP.md.

---

## Product

**IMMO PRO-X** is a sales-led, multi-tenant CRM for Algerian real-estate
agencies and promoters. Tenants manage a 9-stage sales pipeline, their
listings, agents, landing pages, campaigns, and AI-assisted call
scripts. The business model is sales-led B2B: leads fill out a demo
request form on the marketing site, the founder qualifies them, and
tenants are provisioned manually from Super Admin. There is no
self-service signup.

## Live domains

- **`immoprox.io`** — public marketing site (static HTML + GTM analytics)
- **`app.immoprox.io`** — the React CRM (Vite build, private per-tenant)
- **Supabase** project ref: `lbnqccsebwiifxcucflg` — shared backend for
  both sides (Postgres, Auth, Storage, Edge Functions, RLS)

## Repo split

There are **two GitHub repos**, one per site. They are deployed
independently on Hostinger via native git integration.

| Repo | URL | Deploys to | Build |
|---|---|---|---|
| `kardahmed/immoproxv2f` (this one) | github.com/kardahmed/IMMOPROXV2F | `app.immoprox.io` | Vite: `npm ci && npm run build` → `dist/` |
| `kardahmed/immoprox-marketing-website` | github.com/kardahmed/immoprox-marketing-website | `immoprox.io` | Static (no build) |

**IMPORTANT — MCP scope**: the GitHub MCP tools in Claude Code sessions
are scoped to `kardahmed/immoproxv2f` only. For cross-repo changes on
the marketing site, changes must be made manually (drag-drop on GitHub
Web) or via local git CLI — the assistant cannot open PRs or comment on
the marketing repo through MCP.

## This repo contains

```
immoproxv2f/
├── src/                 # React app (Vite)
│   ├── pages/           # Route components (auth, dashboard, pipeline, superadmin, landing, ...)
│   ├── components/      # Shared UI (common/, ui/, layout/)
│   ├── hooks/           # Auth, i18n, dark mode, keyboard shortcuts
│   ├── lib/             # supabase client, constants, errors, utils
│   ├── i18n/            # fr.ts, ar.ts
│   ├── store/           # zustand stores (auth, superAdmin, ...)
│   └── types/           # database.generated.ts + domain types
├── supabase/            # SHARED backend (serves both frontends)
│   ├── migrations/      # 001 base schema → 015 marketing_leads
│   ├── functions/       # Edge Functions (Deno):
│   │   ├── capture-lead/           # landing-page lead API
│   │   ├── create-tenant-user/     # super admin tenant provisioning
│   │   ├── notify-lead-whatsapp/   # CallMeBot/Meta notification on INSERT
│   │   ├── send-whatsapp/          # tenant → client WhatsApp (Meta Cloud API)
│   │   ├── whatsapp-signup/        # Embedded Signup OAuth callback
│   │   ├── capture-lead/
│   │   ├── send-email/             # Resend-based outbound email
│   │   ├── send-campaign/          # bulk email
│   │   ├── check-payments/, check-reservations/, check-reminders/ → cron jobs
│   │   ├── ai-suggestions/, generate-call-script/ → Claude API calls
│   │   └── _shared/                # email-templates, rateLimit, send-email-internal
│   └── tests/           # TESTS_CHECKLIST.md, UI_TEST_RESULTS.md
├── public/              # app.immoprox.io assets (favicon, logo, robots.txt, sw.js, .htaccess)
├── index.html           # Vite entry (has noindex, Inter font)
├── vite.config.ts       # manual chunk splitting for vendor libs
└── .github/workflows/   # deploy.yml (FTPS fallback, workflow_dispatch), ci.yml (currently broken — no runners)
```

## What this repo does NOT contain

- `marketing/` HTML — moved to the `immoprox-marketing-website` repo
- The marketing site's `.htaccess`, `robots.txt`, `sitemap.xml` — also in the marketing repo
- Static marketing assets (screenshots, shared.css) — marketing repo

## Tech stack

- **React 19** + **TypeScript 6** + **Vite 8**
- **Tailwind CSS 4** + **shadcn-style components** (in `src/components/ui/`)
- **react-router-dom v7** for routing
- **@tanstack/react-query 5** for server state
- **react-hook-form + zod** for forms
- **zustand** for client state (auth, super admin, ...)
- **i18next** for i18n (fr + ar) with RTL support
- **Supabase JS 2** for auth + database + storage + edge functions
- **Deno** for Supabase Edge Functions
- **lucide-react** for icons
- **recharts** for charts (lazy loaded — heavy)
- **date-fns** for dates (with fr locale)

## Key conventions + gotchas

### Routing
- `app.immoprox.io/` redirects to `/login` for unauthenticated users, `/dashboard` otherwise
- Super Admin routes live under `/admin/*` (gated by `SuperAdminRoute`)
- Tenant user routes: `/dashboard`, `/pipeline`, `/projects`, `/planning`, `/dossiers`, `/tasks`
- Tenant admin-only: `/goals`, `/performance`, `/agents`, `/reports`, `/marketing-roi`, `/settings`, `/landing`
- Public tenant landing pages: `/p/:slug` — served by `PublicLandingPage`
- The `/register` route was removed — no self-service signup

### URLs across the two sites
- Login page (`LoginPage.tsx`) links to `https://immoprox.io/{cgu,confidentialite,contact}` (absolute, no `.html`)
- Marketing pages link to `https://app.immoprox.io/login` (absolute)
- Marketing URLs use pretty URLs (`/contact`, not `/contact.html`) — handled by `.htaccess` rewrites in the marketing repo

### SEO
- `app.immoprox.io` has `robots.txt` → `Disallow: /` AND `<meta name="robots" content="noindex, nofollow">` in index.html. The CRM must never be indexed.
- `immoprox.io` has a proper sitemap + robots with `Allow: /`. Marketing is the only indexable surface.

### Auth flow
- Supabase Auth with email/password
- Users are in both `auth.users` and `public.users` (with `tenant_id` + `role`)
- Roles: `agent`, `admin`, `super_admin`
- RLS policies gate every tenant-scoped table on `auth.uid()` → `users.tenant_id`
- Tenant provisioning is done via the `create-tenant-user` Edge Function (service role key, sends invitation email)

### Security model
- Marketing `contact.html` uses the Supabase **anon key** directly in the browser to insert into `marketing_leads`. Safe because RLS only allows `INSERT` from anon, not `SELECT`.
- The CRM also uses the anon key from browser — RLS does the heavy lifting. Never put the service role key in client code.
- All sensitive API work happens in Edge Functions with the service role key (server-side only).

### Deployment
- Hostinger native git integration watches `main` on both repos; pushes auto-redeploy.
- `deploy.yml` is a FTPS fallback, set to `workflow_dispatch` only. Ignore unless the git integration breaks.
- `ci.yml` exists but currently fails (no runners provisioned on this account). Not blocking — local `npm run build` is the source of truth until Actions are fixed.

### Code style
- Follow the principles in the system prompt: no unnecessary comments, no premature abstractions, no error handling for impossible cases. Trust internal code, validate at boundaries only.
- Lazy-load heavy modals and pages (see `App.tsx` — most routes are `lazy(() => import(...))`).
- Prefer editing existing files over creating new ones.

### Known rough edges
- `ci.yml` infra never provisions runners — every PR shows a red `build` check. Pre-existing. Safe to merge on red for now.
- The WhatsApp tables (`whatsapp_config`, `whatsapp_accounts`, `whatsapp_messages`, `whatsapp_templates`) exist in Supabase but are **not in any migration file** — they were created directly in Studio. A future migration should capture their schema.
- `deploy.yml` retained as a fallback — its `server-dir` assumes Hostinger subdomain layout, verify if ever used.

## How to run locally

```bash
npm ci
npm run dev
```

Then open http://localhost:5173.

Requires a `.env` with:

```
VITE_SUPABASE_URL=https://lbnqccsebwiifxcucflg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci... (anon key from Supabase Project Settings → API)
```

Edge Functions require extra server-side secrets (set via Supabase
Dashboard → Project Settings → Edge Functions → Secrets):

- `ANTHROPIC_API_KEY` — for `ai-suggestions`, `generate-call-script`
- `RESEND_API_KEY` — for email sending
- `CALLMEBOT_API_KEY` + `NOTIFY_PHONE` — for lead WhatsApp pings (current stopgap)
- `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_TEMPLATE_NAME` — once Meta Cloud API is wired

## Interacting with the user

The user (founder `kardahmed`, based in Algeria) is **not a developer**.
When guiding:
- Give terminal commands one per line, each in its own fenced block
- Warn when copy-pasting is tricky (dotfiles hidden in Finder, token
  pasting not visible, etc.)
- Keep markdown formatting simple (tables, headings, short bullets)
- He writes in French-Arabic-mixed shorthand — answer in French
- He operates on Mac. hPanel / Hostinger is in mixed Arabic/French
  depending on locale

## Links

- GitHub (CRM): https://github.com/kardahmed/immoproxv2f
- GitHub (marketing): https://github.com/kardahmed/immoprox-marketing-website
- Supabase Dashboard: https://supabase.com/dashboard/project/lbnqccsebwiifxcucflg
- Hostinger: https://hpanel.hostinger.com
- Meta for Developers: https://developers.facebook.com/apps/
- Cal.com booking: https://cal.eu/kardahmed/demo-immo-pro-x-30min (linked from marketing contact form)
