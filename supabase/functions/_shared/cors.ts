// Shared CORS helper. The pre-fix `Access-Control-Allow-Origin: *`
// pattern lived inline in 11 Edge Functions. With wildcard origins
// the browser refuses to attach credentials, but credential-less
// endpoints (capture-lead, public OAuth callbacks) still expose
// themselves to drive-by callers from any site, and the missing
// `Vary: Origin` header prevents proper caching.
//
// Single source of truth. Add new origins to ALLOWED_ORIGINS only
// — never reintroduce '*'.

const ALLOWED_ORIGINS = new Set<string>([
  'https://app.immoprox.io',
  'http://localhost:5173',
])

/**
 * Build the CORS headers for a given request, echoing back the
 * caller's Origin only when it's in the allow-list. Falls back to
 * the production app URL so preflight requests from unknown origins
 * still get a valid (but non-permissive) response.
 *
 * Always sets `Vary: Origin` so any CDN / browser caches per-origin
 * and never serves a cached "Access-Control-Allow-Origin" from one
 * origin to another.
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.immoprox.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}
