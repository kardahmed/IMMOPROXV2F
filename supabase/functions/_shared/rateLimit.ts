/**
 * Rate limiters for Edge Functions.
 *
 * `rateLimit` is in-memory (per-isolate) — fine for soft throttling
 * a single instance, but doesn't enforce a global ceiling because
 * Supabase Edge runs multiple isolates per region.
 *
 * `rateLimitDb` is the audit-recommended replacement: it calls the
 * `rate_limit_bump` RPC (migration 050) which atomically increments
 * a Postgres-backed bucket, so the limit is enforced across every
 * isolate.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const store = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(
  ip: string,
  maxRequests = 30,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const key = ip

  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  entry.count++
  const allowed = entry.count <= maxRequests
  const remaining = Math.max(0, maxRequests - entry.count)

  return { allowed, remaining, resetAt: entry.resetAt }
}

export function rateLimitResponse(ip: string, maxRequests = 30, windowMs = 60_000) {
  const { allowed, remaining, resetAt } = rateLimit(ip, maxRequests, windowMs)

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
        'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
      },
    })
  }

  return null // Allowed
}

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 5 * 60_000)

// ────────────────────────────────────────────────────────────────────
// DB-backed rate limiter — replaces the per-isolate Map for endpoints
// that absolutely need a global ceiling (capture-lead, signup, etc).
// ────────────────────────────────────────────────────────────────────

export async function rateLimitDb(
  supabase: SupabaseClient,
  bucketKey: string,
  maxRequests = 30,
  windowMs = 60_000,
): Promise<{ allowed: boolean; count: number; limit: number; retryAfterMs: number }> {
  const { data, error } = await supabase.rpc('rate_limit_bump' as never, {
    p_bucket_key: bucketKey,
    p_window_ms: windowMs,
  } as never)
  if (error) {
    // Fail open — better to let one or two extra requests through
    // than to lock down the system on a transient DB hiccup.
    console.warn('[rateLimitDb] RPC failed, allowing request', error.message)
    return { allowed: true, count: 0, limit: maxRequests, retryAfterMs: 0 }
  }
  const count = Number(data ?? 0)
  return {
    allowed: count <= maxRequests,
    count,
    limit: maxRequests,
    retryAfterMs: windowMs,
  }
}

export function rateLimitDbResponse(
  state: { allowed: boolean; count: number; limit: number; retryAfterMs: number },
): Response | null {
  if (state.allowed) return null
  return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': String(state.limit),
      'X-RateLimit-Remaining': '0',
      'Retry-After': String(Math.ceil(state.retryAfterMs / 1000)),
    },
  })
}
