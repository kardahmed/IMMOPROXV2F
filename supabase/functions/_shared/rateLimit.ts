/**
 * Simple in-memory rate limiter for Edge Functions.
 * Limits requests per IP within a time window.
 */
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
