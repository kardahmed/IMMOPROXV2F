// Shared auth helpers for Edge Functions.
//
// Three categories of endpoints:
//
//   1. Service-role only (cron jobs, database webhooks):
//      requireServiceRole(req) — checks the Authorization header
//      against SUPABASE_SERVICE_ROLE_KEY with strict equality.
//
//   2. Database webhook with shared secret (notify-lead-whatsapp,
//      anything triggered by Supabase Database Webhooks):
//      requireWebhookSecret(req, envName) — checks a custom header
//      configured on the webhook ("Authorization: Bearer <secret>"
//      or "X-Webhook-Secret: <secret>").
//
//   3. Authenticated user (everything called from the React app):
//      The function should keep using supabase.auth.getUser() — this
//      file provides requireUser(req, supabase) as a thin wrapper
//      that returns the user or sends a 401.
//
// The 28-Apr-2026 audit found seven endpoints exposed without any of
// these checks (send-email, send-campaign, notify-lead-whatsapp,
// send-alert, check-quota-alerts, check-tasks-no-reply,
// recompute-engagement). This helper was added so the fix is a
// one-liner per function.

import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Returns null if the request carries the correct service-role bearer
 * token, otherwise a 401 Response that the caller should return as-is.
 *
 * Usage:
 *   const denied = requireServiceRole(req)
 *   if (denied) return denied
 */
export function requireServiceRole(req: Request): Response | null {
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
  const got = req.headers.get('Authorization') ?? ''

  // Strict equality. NOT .includes() — the previous send-alert check
  // accepted any header containing "Bearer", which is every
  // authenticated user JWT.
  if (got !== expected) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return null
}

/**
 * Returns null if the request carries the correct webhook shared
 * secret, otherwise a 401 Response. The secret is read from the
 * environment variable named by envName (so each webhook can have
 * its own secret rather than sharing one).
 *
 * Supports both "Authorization: Bearer <secret>" and
 * "X-Webhook-Secret: <secret>" since Supabase Database Webhooks
 * default to the latter.
 */
export function requireWebhookSecret(req: Request, envName: string): Response | null {
  const expected = Deno.env.get(envName)
  if (!expected) {
    // Fail-closed: if the secret isn't configured, refuse to run
    // rather than silently accepting unauthenticated calls.
    console.error(`[auth] ${envName} not set — refusing webhook call`)
    return new Response(
      JSON.stringify({ error: 'Webhook not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const xWebhook = req.headers.get('X-Webhook-Secret') ?? ''

  if (authHeader === `Bearer ${expected}` || xWebhook === expected) {
    return null
  }

  return new Response(
    JSON.stringify({ error: 'Invalid webhook secret' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  )
}

/**
 * Resolves the calling user from a Bearer JWT. Returns the user, or
 * a 401 Response. The supabase client must be created with the
 * service role key so it can call auth.getUser() on the JWT.
 */
export async function requireUser(
  req: Request,
  supabase: SupabaseClient,
): Promise<{ user: User } | { response: Response }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return {
      response: new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    }
  }

  const { data, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !data?.user) {
    return {
      response: new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    }
  }
  return { user: data.user }
}

/**
 * After requireUser, fetch the user's tenant_id and role. Returns a
 * 403 if the user has no tenant or the role is not in the allowed
 * list. Useful for endpoints that should only run for tenant admins
 * or agents.
 */
export async function requireTenantRole(
  supabase: SupabaseClient,
  userId: string,
  allowedRoles: Array<'agent' | 'admin' | 'super_admin'>,
): Promise<{ tenantId: string; role: string } | { response: Response }> {
  const { data } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', userId)
    .single()

  const profile = data as { tenant_id: string | null; role: string } | null
  if (!profile?.tenant_id || !allowedRoles.includes(profile.role as 'agent' | 'admin' | 'super_admin')) {
    return {
      response: new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    }
  }
  return { tenantId: profile.tenant_id, role: profile.role }
}
