// Shared formatting helpers — single source of truth for the bits
// that were redefined inline across half a dozen pages
// (KanbanCard, CardsView, ConversationList, ConversationThread,
// ClientDetailPage, TaskDetailModal, CallModeOverlay, AnalyticsTab,
// ExpensesTab, etc.).
//
// Adding a new format function here is cheaper than fixing the same
// issue in N places.

/**
 * "Karim Benali" → "KB". Falls back to "?" for empty / nullish input.
 * Splits on whitespace, takes the first letter of the first two
 * meaningful tokens.
 */
export function getInitials(label: string | null | undefined): string {
  const s = (label ?? '').trim()
  if (!s) return '?'
  const parts = s.split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return '?'
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/**
 * Seconds → "MM:SS". Handles negatives and >60 min by clamping at 0
 * and letting minutes overflow naturally (so 3700 → "61:40").
 */
export function formatSecondsAsMmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mm = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

/**
 * Strip whitespace / parens / dashes from a phone number, then
 * normalize a leading 0 to the Algerian country code 213 so we end up
 * with a wa.me / tel: friendly format. Idempotent on already-formatted
 * numbers like "213 542 76 60 68".
 */
export function cleanPhoneAlgerian(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.replace(/[\s\-()]/g, '').replace(/^0/, '213')
}

/**
 * Map any reasonably French/Arabic/Latin name to a URL-safe slug,
 * stripping accents and non-alphanumerics. Capped at 40 chars.
 */
export function slugify(input: string): string {
  return (input ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Short month labels, FR. Used by every recharts bar / line chart.
 * Hoisted so it's not re-allocated each render in the parent
 * component.
 */
export const MONTH_NAMES_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'] as const

/**
 * Weekday short labels FR, Monday-first (matches date-fns fr locale).
 */
export const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const
