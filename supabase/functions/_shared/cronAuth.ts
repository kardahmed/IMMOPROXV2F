// cronAuth — verify the inbound request comes from a legitimate service_role caller.
//
// Pre-fix the cron-fired functions did `if (authHeader !== Bearer ${env.SERVICE_KEY})`
// which is a literal string comparison. That breaks the moment Supabase rotates
// the JWT secret or migrates to a new key format — the env-injected key may
// drift from the dashboard one, leaving cron jobs silently 401'ing.
//
// Cleaner: the Supabase gateway already validated the JWT signature (otherwise
// we'd never even reach the function). All we need to confirm here is that
// the JWT was minted with role=service_role, not anon. A quick payload decode
// is enough — no need to verify the signature again.

export function isAuthorizedCron(req: Request): boolean {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice('Bearer '.length).trim()
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    // base64url → base64 → JSON
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
    const payload = JSON.parse(atob(padded))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}
