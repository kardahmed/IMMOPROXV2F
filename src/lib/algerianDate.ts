// Algerian timezone helper.
//
// Algeria runs on UTC+1 year-round (CET, no DST). When a user picks
// "14:00" for a visit on a date, they MEAN 14:00 Algiers — but
// `new Date('2026-05-01T14:00:00')` interprets the string as LOCAL
// (browser) time and `new Date('2026-05-01T14:00:00').toISOString()`
// then serializes it to UTC, drifting 1h or more depending on the
// browser's timezone.
//
// Pre-fix the codebase did:
//
//   scheduled_at: `${visitDate}T${visitTime}:00`
//
// which Postgres TIMESTAMPTZ parses as the server's session timezone
// (UTC by default on Supabase) — so 14:00 Algiers got persisted as
// 14:00 UTC then rendered back as 15:00 in the UI for users with
// the locale-aware formatter.
//
// All call sites that build a TIMESTAMPTZ from a user-entered date
// + time should now use `algerianDateTimeToISO()` so the offset is
// always +01:00.

const ALGERIAN_OFFSET = '+01:00'

/**
 * Build an ISO 8601 timestamp anchored in Algiers (+01:00) from a
 * date and a time picked by the user.
 *
 * @param date "YYYY-MM-DD" — typically from `<input type="date">`.
 * @param time "HH:MM" — typically from a select or `<input type="time">`.
 *             Defaults to 00:00 when omitted (e.g. "leave starts on 2026-05-01").
 */
export function algerianDateTimeToISO(date: string, time = '00:00'): string {
  if (!date) throw new Error('algerianDateTimeToISO: date is required')
  // Pad time to HH:MM if a single-digit hour was passed.
  const t = time.length === 4 ? `0${time}` : time
  return `${date}T${t}:00${ALGERIAN_OFFSET}`
}

/**
 * Same idea but for a "date only" input — the result is anchored
 * at midnight Algiers, useful for things like leave start/end
 * boundaries that the cron checks at 00:00 local time.
 */
export function algerianDateToISO(date: string): string {
  return algerianDateTimeToISO(date, '00:00')
}

/**
 * Inverse: given a TIMESTAMPTZ from the DB (any UTC-rendered ISO),
 * extract the "YYYY-MM-DD" and "HH:MM" as the user in Algiers
 * would read them. Used when pre-filling edit dialogs.
 */
export function isoToAlgerianDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  // `toLocaleString('fr-FR', { timeZone: 'Africa/Algiers' })` gives
  // a localized string but it's locale-dependent; do the offset by
  // hand for stable parsing.
  const utcMs = d.getTime()
  const algiersMs = utcMs + 60 * 60 * 1000 // +01:00
  const a = new Date(algiersMs)
  const yyyy = a.getUTCFullYear()
  const mm = String(a.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(a.getUTCDate()).padStart(2, '0')
  const hh = String(a.getUTCHours()).padStart(2, '0')
  const min = String(a.getUTCMinutes()).padStart(2, '0')
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` }
}
