/** Desteklenen yıl aralığı (backend ile aynı, bkz. docs/API.md). Negatif = MÖ, yıl 0 yoktur. */
export const MIN_YEAR = -100000
export const MAX_YEAR = 100000

function group(n: number): string {
  const s = String(n)
  return s.length >= 5 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : s
}

/** Yıl gösteriminin tek kaynağı: MÖ 44, MS 476, 1453, 12.000. */
export function formatYear(year: number): string {
  if (!Number.isInteger(year) || year === 0) {
    throw new Error(`Geçersiz yıl: ${year}`)
  }
  if (year < 0) return `MÖ ${group(-year)}`
  if (year < 1000) return `MS ${year}`
  return group(year)
}
