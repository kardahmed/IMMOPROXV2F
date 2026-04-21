# IMMO PRO-X

> CRM immobilier multi-tenant pour promoteurs et agences en Algerie.

![Tech](https://img.shields.io/badge/stack-React%2019%20%2B%20Vite%20%2B%20Supabase-0579DA)
![i18n](https://img.shields.io/badge/i18n-FR%20%7C%20AR-00D4A0)

Pipeline de vente 9 etapes, landing pages avec tracking publicitaire,
scripts d'appel IA, gestion multi-projets / multi-agents, bilingue FR/AR (RTL),
paiement manuel via WhatsApp.

---

## Stack

- **Front** : React 19 + TypeScript + Vite, Tailwind 4, TanStack Query, Zustand, react-hook-form + Zod
- **Back** : Supabase (PostgreSQL + Auth + Edge Functions Deno)
- **Services** : Resend (email), Anthropic Claude (IA), Meta WhatsApp Cloud API

## Demarrage rapide

### Prerequis
- Node.js 20+
- Un projet Supabase (gratuit)

### Setup local

```bash
# 1. Clone + install
git clone https://github.com/kardahmed/IMMOPROXV2F.git
cd IMMOPROXV2F
npm install

# 2. Configure .env
cp .env.example .env
# Remplir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
# (Supabase Dashboard > Settings > API)

# 3. Lancer le serveur dev
npm run dev
# → http://localhost:5173
```

### Setup Supabase

Applique les migrations dans l'ordre via le SQL Editor de Supabase.
Documentation detaillee : [`supabase/migrations/README.md`](./supabase/migrations/README.md).

Principales etapes :

1. **Migrations** : 001 a 017, dans l'ordre
2. **Postgres settings** (pour les crons) :
   - `app.settings.supabase_url`
   - `app.settings.service_role_key`
3. **Edge Function secrets** : `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN`, etc.
4. **Storage buckets** : `project-gallery`, `tenant-logos`, `client-documents`, `email-assets`, `landing-assets`
5. **Deployer les edge functions** :
   ```bash
   supabase functions deploy --project-ref <ref>
   ```

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Dev server avec HMR (port 5173) |
| `npm run build` | Build production (output `dist/`) |
| `npm run preview` | Servir le build local |
| `npm run lint` | ESLint |

## Architecture

```
src/
  App.tsx              Routes (React Router v7)
  main.tsx             Entry (QueryClient, i18n, ErrorBoundary, CookieConsent)
  pages/               Pages lazy-loaded
    auth/              Login, Register, Forgot/Reset Password, AcceptInvite
    dashboard/         KPI, charts, alerts
    pipeline/          9-stage pipeline (kanban, cards, table, analytics)
    projects/          Liste + detail projet + units
    agents/            Gestion agents + invitations + permissions
    settings/          Parametres tenant (branding, playbook, visites, ...)
    billing/           Plan tenant + demandes de paiement
    superadmin/        Console super-admin
    ...
  components/
    ui/                Primitives (shadcn-style)
    common/            Modal, Wizard, DataTable, KPICard, etc.
    layout/            AppLayout, Sidebar, Topbar
    billing/           PaymentRequestModal
  hooks/               useAuth, useClients, useProjects, useEmailMarketing...
  lib/                 supabase.ts, errors.ts, emitEvent.ts, rateLimit.ts, ...
  store/               Zustand (authStore, superAdminStore)
  types/               Supabase generated types
  i18n/                FR + AR

supabase/
  migrations/          SQL schemas (001-017)
  functions/           Edge functions (Deno)
    emit-webhook/      Dispatch webhooks outbound with HMAC
    send-email/        Resend transactional
    send-campaign/     Email marketing campaigns
    send-whatsapp/     Meta WhatsApp Cloud API
    generate-call-script/  Anthropic Claude scripts
    ai-suggestions/    Recommendations
    check-payments/    Cron: overdue payment detection
    check-reservations/  Cron: reservation expiry
    check-reminders/   Cron: daily reminders
    delete-account/    RGPD account deletion
    ...

public/
  marketing/           Site marketing statique (HTML + CSS)
  sw.js                Service worker (notifications)
  logo*.png, favicon

marketing/             (DEPRECATED — voir public/marketing/)
```

## Fonctionnalites

- **Pipeline 9 etapes** : accueil -> visite a gerer -> visite confirmee -> visite terminee -> negociation -> reservation -> vente -> relancement -> perdue
- **Multi-tenant** : chaque agence isolee via RLS Postgres
- **Roles** : super_admin (plateforme) / admin (tenant) / agent (avec profils de permissions)
- **Projets / unites** : multi-projets, grille disponibilite, simulateur de prix, comparateur
- **Landing pages** : builder drag-and-drop avec A/B testing et tracking Meta/Google
- **Emails** : transactionnels + campagnes (Resend), tracking opens / clicks
- **IA** : scripts d'appel personnalises, suggestions, playbook
- **Paiements** : facturation manuelle via WhatsApp (pas d'encaissement en ligne pour le moment)
- **Integrations** : cles API + webhooks HMAC sortants (client, ventes, reservations, etc.)
- **Dark mode** + **RTL** + **FR/AR**

## Deploiement

### Front (Vercel / Netlify / Cloudflare Pages)

```bash
# Build command
npm run build

# Output directory
dist
```

Variables d'environnement a configurer :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Back (Supabase)

Le back-end Supabase est gere via le dashboard. Les edge functions sont deployees via la CLI.

## Contribution

Developpement sur la branche `claude/review-project-*` ou feature branches.
Merger sur `main` apres review + CI vert.

## Licence

Proprietaire — IMMO PRO-X © 2026.
