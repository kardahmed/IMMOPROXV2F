// Recomputes clients.engagement_score for every active (non-deleted)
// client across all tenants. Wired by migration 033 to run every 6h
// (00:00, 06:00, 12:00, 18:00 UTC).
//
// MVP closure plan step D — version SIMPLE (rule-based, no ML).
// The smart ML version is deferred to backlog until we have ~3 months
// of prod data to calibrate on.
//
// Algorithm (each signal independently bounded, final score clamped
// to [0, 100]):
//
//   start at 50 (neutral)
//   +20  if any inbound WhatsApp message in the last 7 days
//        (responsive client)
//   +15  per realized visit (status='completed') in last 90 days,
//        capped at +30 (i.e., 2+ visits saturate)
//   -20  if no contact (history activity) for >14 days
//        (or if no history exists and client created >14 days ago)
//   -10  per auto_cancelled task in last 30 days, capped at -30
//
// All updates run in a single SQL statement per tenant for
// efficiency; the function loops only over tenants, not over
// clients.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Service-role only — this cron rewrites engagement_score for
  // every active tenant. An unauthenticated caller could fabricate
  // scores or DoS the database with repeated bulk updates.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // List all tenants that aren't suspended. We update one tenant at
  // a time so a slow query on a huge tenant doesn't block the others.
  const { data: tenants, error: tenantsErr } = await supabase
    .from('tenants')
    .select('id, name')
    .is('suspended_at', null)

  if (tenantsErr) {
    console.error('[recompute-engagement] tenants list failed:', tenantsErr)
    return new Response(
      JSON.stringify({ ok: false, error: tenantsErr.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const result = {
    tenants_processed: 0,
    clients_updated: 0,
    errors: [] as string[],
  }

  for (const tenant of (tenants ?? []) as Array<{ id: string; name: string }>) {
    // Single bulk UPDATE per tenant. The CTE pattern keeps the math
    // readable: each delta is computed once per client, then summed
    // and clamped at the outer level.
    const { data: rows, error: updateErr } = await supabase.rpc(
      'recompute_engagement_for_tenant' as never,
      { p_tenant_id: tenant.id } as never,
    )

    if (updateErr) {
      result.errors.push(`Tenant ${tenant.name}: ${updateErr.message}`)
      continue
    }

    result.tenants_processed++
    result.clients_updated += (rows as number) ?? 0
  }

  console.log(
    `[recompute-engagement] ${result.tenants_processed} tenant(s), ${result.clients_updated} client(s) updated, ${result.errors.length} error(s)`,
  )
  if (result.errors.length > 0) {
    console.error('[recompute-engagement] errors:', result.errors)
  }

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
