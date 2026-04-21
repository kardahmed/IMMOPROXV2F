// Lightweight client-side rate limiter backed by localStorage.
// Not a substitute for server-side protection, but blocks trivial brute force.

interface RateLimitEntry {
  attempts: number
  firstAt: number
  lockedUntil: number | null
}

const PREFIX = 'ipx-ratelimit:'

export function checkRateLimit(
  key: string,
  opts: { maxAttempts: number; windowMs: number; lockoutMs: number },
): { allowed: boolean; remainingMs: number; attemptsLeft: number } {
  const storageKey = `${PREFIX}${key}`
  const now = Date.now()
  const raw = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
  const entry: RateLimitEntry = raw
    ? JSON.parse(raw)
    : { attempts: 0, firstAt: now, lockedUntil: null }

  // Still locked?
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { allowed: false, remainingMs: entry.lockedUntil - now, attemptsLeft: 0 }
  }

  // Window elapsed → reset
  if (now - entry.firstAt > opts.windowMs) {
    entry.attempts = 0
    entry.firstAt = now
    entry.lockedUntil = null
  }

  const attemptsLeft = Math.max(0, opts.maxAttempts - entry.attempts)
  return { allowed: attemptsLeft > 0, remainingMs: 0, attemptsLeft }
}

export function recordAttempt(
  key: string,
  success: boolean,
  opts: { maxAttempts: number; windowMs: number; lockoutMs: number },
) {
  if (typeof window === 'undefined') return
  const storageKey = `${PREFIX}${key}`

  if (success) {
    localStorage.removeItem(storageKey)
    return
  }

  const now = Date.now()
  const raw = localStorage.getItem(storageKey)
  const entry: RateLimitEntry = raw
    ? JSON.parse(raw)
    : { attempts: 0, firstAt: now, lockedUntil: null }

  if (now - entry.firstAt > opts.windowMs) {
    entry.attempts = 1
    entry.firstAt = now
    entry.lockedUntil = null
  } else {
    entry.attempts += 1
    if (entry.attempts >= opts.maxAttempts) {
      entry.lockedUntil = now + opts.lockoutMs
    }
  }

  localStorage.setItem(storageKey, JSON.stringify(entry))
}

export const LOGIN_RATE_LIMIT = { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 }
export const INVITE_RATE_LIMIT = { maxAttempts: 10, windowMs: 60 * 60 * 1000, lockoutMs: 30 * 60 * 1000 }

export function formatRemainingTime(ms: number): string {
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 1) return 'quelques secondes'
  if (minutes === 1) return '1 minute'
  return `${minutes} minutes`
}
