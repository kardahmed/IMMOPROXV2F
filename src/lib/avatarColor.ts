// Deterministically pick a colour for an avatar / chip given a name
// or any string. Used in 6+ places (agent avatars, kanban cards,
// client side-panels, etc.) so it's worth a single source of truth.
//
// The hash is the standard "djb2 lite" byte-walk: cheap, deterministic,
// and gives a reasonable spread across the palette for typical Algerian
// agency names + first names.

const PALETTE = [
  '#00D4A0',
  '#3782FF',
  '#FF9A1E',
  '#A855F7',
  '#06B6D4',
  '#EAB308',
  '#F97316',
  '#EC4899',
] as const

export function nameToColor(name: string | null | undefined): string {
  const s = (name ?? '').trim()
  if (!s) return PALETTE[0]
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = s.charCodeAt(i) + ((h << 5) - h)
  }
  return PALETTE[Math.abs(h) % PALETTE.length]
}
