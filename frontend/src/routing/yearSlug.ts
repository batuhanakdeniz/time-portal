import { MAX_YEAR, MIN_YEAR } from '../lib/year'

/** Geçerli yıl: tam sayı, 0 değil, desteklenen aralıkta (docs/API.md). */
export function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year !== 0 && year >= MIN_YEAR && year <= MAX_YEAR
}

/** URL'deki yıl: 1453 → "1453", MÖ 1200 (-1200) → "mo-1200". */
export function yearToSlug(year: number): string {
  if (!isValidYear(year)) throw new Error(`Geçersiz yıl: ${year}`)
  return year < 0 ? `mo-${-year}` : String(year)
}

export interface ParsedYear {
  year: number
  /** false ise URL kanonik biçime (yearToSlug) yönlendirilmeli: "-1200", "01453". */
  canonical: boolean
}

// En fazla 6 hane: aralık ±100000; daha uzunu zaten geçersizdir.
const YEAR_SLUG = /^(mo-|-)?(\d{1,6})$/

/** "1453", "mo-1200" kanonik; "-1200" kabul edilir ama yönlendirilir. 0 ve aralık dışı → null. */
export function parseYearSlug(slug: string | undefined): ParsedYear | null {
  if (slug === undefined) return null
  const m = YEAR_SLUG.exec(slug)
  if (!m) return null
  const abs = Number(m[2])
  const year = m[1] ? -abs : abs
  if (!isValidYear(year)) return null
  return { year, canonical: yearToSlug(year) === slug }
}
