# Supabase Migrations & Setup

## Migration order

Apply migrations in numerical order in the Supabase SQL Editor:

```
001_create_tables.sql              — Core schema (tenants, users, projects, clients, units, …)
002_super_admin.sql                — Super-admin role + platform_settings
003_tenant_maintenance.sql         — Tenant maintenance metadata
004_tenant_plans.sql               — Plan column, plan_limits
005_fix_rls_recursion.sql          — RLS infinite-recursion fix
006_landing_pages.sql              — Landing page builder tables
007_landing_sections.sql           — Landing sections JSON
008_ab_testing_multilang.sql       — A/B tests + multilingual
009_call_scripts.sql               — AI call scripts
010_audit_fixes.sql                — Audit trail improvements
011_super_admin_advanced.sql       — Platform settings: AI keys, trial_ends_at
012_email_logs.sql                 — Email tracking
013_consolidate_crons.sql          — pg_cron jobs for check-payments / reservations / reminders
014_email_marketing.sql            — Campaigns, templates, audiences
015_auth_and_integrations.sql      — Invitations, api_keys, webhooks, webhook_deliveries
016_manual_billing.sql             — Plan prices, payment_requests, subscription_history
```

## Required Postgres settings (one-time)

Migration 013 uses `pg_net` to call edge functions from cron jobs. Two settings must be populated
in the Supabase Database → Settings → Custom Postgres Config:

```
app.settings.supabase_url     = https://<project-ref>.supabase.co
app.settings.service_role_key = eyJ... (service role key)
```

Without these, cron jobs will log `app.settings not configured` and silently skip.

## Required Edge Function secrets

In the Supabase Dashboard → Edge Functions → Secrets, set:

| Secret | Purpose | Required for |
|---|---|---|
| `RESEND_API_KEY` | Transactional + campaign emails | `send-email`, `send-campaign`, `track-email` |
| `ANTHROPIC_API_KEY` | AI call-script generation, suggestions | `generate-call-script`, `ai-suggestions` |
| `OPENAI_API_KEY` | Optional AI fallback | same |
| `WHATSAPP_TOKEN` | Meta Cloud API token (if using WhatsApp) | `send-whatsapp`, `whatsapp-signup` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta sender phone ID | same |

Platform-wide toggles (not secrets) are stored in `platform_settings` and editable from
`/admin/settings` (Super Admin → Platform).

## Required Storage buckets

Create these buckets via Supabase Dashboard → Storage:

| Bucket | Public | Use |
|---|---|---|
| `project-gallery` | yes | Project / unit photos |
| `tenant-logos` | yes | Branding logos |
| `client-documents` | no | CIN, contracts, payment proofs |
| `email-assets` | yes | Email campaign images |
| `landing-assets` | yes | Public landing page images |

## Verifying crons are active

```sql
SELECT * FROM cron.job ORDER BY jobname;
```

You should see `check-reservations-edge`, `check-payments-edge`, `check-reminders-edge`.

If missing, re-run migration `013_consolidate_crons.sql`.

## Testing webhook emission

The `emit-webhook` edge function can be invoked directly:

```bash
curl -X POST "https://<project>.supabase.co/functions/v1/emit-webhook" \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"<uuid>","event_type":"client.created","payload":{"test":true}}'
```
