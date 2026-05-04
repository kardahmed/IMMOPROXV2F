// ─── Wilayas d'Algérie ───

export const WILAYAS = [
  'Adrar', 'Chlef', 'Laghouat', 'Oum El Bouaghi', 'Batna', 'Béjaïa', 'Biskra',
  'Béchar', 'Blida', 'Bouira', 'Tamanrasset', 'Tébessa', 'Tlemcen', 'Tiaret',
  'Tizi Ouzou', 'Alger', 'Djelfa', 'Jijel', 'Sétif', 'Saïda', 'Skikda',
  'Sidi Bel Abbès', 'Annaba', 'Guelma', 'Constantine', 'Médéa', 'Mostaganem',
  'M\'Sila', 'Mascara', 'Ouargla', 'Oran', 'El Bayadh', 'Illizi',
  'Bordj Bou Arréridj', 'Boumerdès', 'El Tarf', 'Tindouf', 'Tissemsilt',
  'El Oued', 'Khenchela', 'Souk Ahras', 'Tipaza', 'Mila', 'Aïn Defla',
  'Naâma', 'Aïn Témouchent', 'Ghardaïa', 'Relizane',
  'El M\'Ghair', 'El Meniaa', 'Ouled Djellal', 'Bordj Badji Mokhtar',
  'Béni Abbès', 'Timimoun', 'Touggourt', 'Djanet', 'In Salah', 'In Guezzam',
] as const

// ─── Format monétaire ───

export const CURRENCY = {
  code: 'DZD',
  symbol: 'DA',
  locale: 'fr-DZ',
} as const

export function formatPrice(amount: number): string {
  // Algerian Dinar (DZD) is officially a no-decimal currency. Bank
  // transfers, real-estate contracts and CCP/CTT cash transactions
  // are all integer DA. Allowing decimals here was a bug — float
  // math elsewhere (multi-unit discount split, percentage deposits)
  // would leak fractional DA into the UI and the contract printout.
  // Round at the format boundary so callers can stay numeric.
  return new Intl.NumberFormat('fr-DZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount)) + ' DA'
}

export function formatPriceCompact(amount: number): string {
  if (amount >= 1_000_000_000) {
    return (amount / 1_000_000_000).toFixed(1).replace('.0', '') + ' Mrd DA'
  }
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toFixed(1).replace('.0', '') + ' M DA'
  }
  if (amount >= 1_000) {
    return (amount / 1_000).toFixed(0) + ' K DA'
  }
  return amount + ' DA'
}

// ─── Format date ───

export const DATE_FORMAT = 'dd/MM/yyyy' as const
export const DATETIME_FORMAT = 'dd/MM/yyyy HH:mm' as const

// ─── Pagination ───

export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

// ─── Limites métier ───

export const BUSINESS_RULES = {
  RESERVATION_DEFAULT_DAYS: 30,
  RESERVATION_MAX_DAYS: 90,
  MIN_DEPOSIT_PERCENTAGE: 10,
  RELAUNCH_ALERT_DAYS: 3,
  URGENT_ALERT_DAYS: 7,
  INACTIVE_AGENT_DAYS: 3,
  MAX_GALLERY_IMAGES: 10,
  MAX_FILE_SIZE_MB: 10,
} as const

// ─── Pipeline order (pour le tri) ───

export const PIPELINE_ORDER = [
  'accueil',
  'visite_a_gerer',
  'visite_confirmee',
  'visite_terminee',
  'negociation',
  'reservation',
  'vente',
  'relancement',
  'perdue',
] as const
