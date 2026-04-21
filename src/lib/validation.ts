// Shared validation utilities used across forms.

/**
 * Algerian phone number validation.
 * Accepts:
 *   - 05XX XX XX XX, 06XX, 07XX (10 digits starting with 05/06/07)
 *   - +213 XX XX XX XX (12 digits)
 *   - 0021399... (international with 00 prefix)
 * Rejects anything else.
 */
export function isValidAlgerianPhone(input: string): boolean {
  if (!input) return false
  const digits = input.replace(/\D/g, '')

  // Local format: 10 digits starting with 05/06/07
  if (/^0[567]\d{8}$/.test(digits)) return true
  // International +213: 12 digits starting with 213 followed by 5/6/7
  if (/^213[567]\d{8}$/.test(digits)) return true
  // With 00 prefix
  if (/^00213[567]\d{8}$/.test(digits)) return true

  return false
}

/** Normalize to E.164 without the leading "+". Returns "" if invalid. */
export function normalizeAlgerianPhone(input: string): string {
  if (!input) return ''
  const digits = input.replace(/\D/g, '')

  if (/^0[567]\d{8}$/.test(digits)) return '213' + digits.slice(1)
  if (/^213[567]\d{8}$/.test(digits)) return digits
  if (/^00213[567]\d{8}$/.test(digits)) return digits.slice(2)
  return ''
}

export const ALGERIAN_PHONE_HELP = '0555 12 34 56 ou +213 555 12 34 56'
