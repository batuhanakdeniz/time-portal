import { formatYear, MAX_YEAR, MIN_YEAR } from '../lib/year'

export type Era = 'MÖ' | 'MS'

export type YearParseResult = { ok: true; year: number } | { ok: false; error: string }

export const ZERO_YEAR_MESSAGE = '0 yılı yok: MÖ 1 ya da MS 1'
export const EMPTY_MESSAGE = 'Bir yıl yaz.'
export const INVALID_MESSAGE = 'Yıl anlaşılamadı. Örnek: 1453, MÖ 1200, -1200'
export const CONFLICT_MESSAGE = 'Hem MÖ hem MS yazılmış; birini seç.'
export const RANGE_MESSAGE = `Yıl ${formatYear(MIN_YEAR)} ile ${formatYear(MAX_YEAR)} arasında olmalı.`

// "MÖ", "M.Ö.", "m.ö", "MO" (Türkçe klavyesiz yazım).
const BC = /m\s*\.?\s*[öo]\s*\.?/g
// "MS", "M.S.", "m.s".
const AD = /m\s*\.?\s*s\s*\.?/g
// 1453 · 12000 · 1.200 · 12 000 (binlik ayırıcı nokta ya da boşluk)
const NUMBER = /^(\d{1,3}(?:[.  ]\d{3})+|\d+)$/

/**
 * Yazılan yılı ayrıştırır. Kabul edilenler: `-1200`, `MÖ 1200`, `1.200 MÖ`, `m.ö. 1200`, `MS 1453`, `1453`.
 * Açık bir çağ (MÖ/MS ya da eksi işareti) yoksa `defaultEra` (MÖ/MS anahtarı) kullanılır.
 */
export function parseYearInput(text: string, defaultEra: Era = 'MS'): YearParseResult {
  let s = text.trim().toLocaleLowerCase('tr')
  if (s === '') return { ok: false, error: EMPTY_MESSAGE }

  let negative = false
  const sign = s.match(/^[-−–]\s*/)
  if (sign) {
    negative = true
    s = s.slice(sign[0].length)
  }

  const hasBc = BC.test(s)
  BC.lastIndex = 0
  s = s.replace(BC, ' ')
  const hasAd = AD.test(s)
  AD.lastIndex = 0
  s = s.replace(AD, ' ').trim()

  if (hasBc && hasAd) return { ok: false, error: CONFLICT_MESSAGE }
  if (negative && hasAd) return { ok: false, error: CONFLICT_MESSAGE }
  if (!NUMBER.test(s)) return { ok: false, error: INVALID_MESSAGE }

  const digits = s.replace(/[.  ]/g, '')
  const n = Number(digits)
  if (!Number.isSafeInteger(n)) return { ok: false, error: RANGE_MESSAGE }
  if (n === 0) return { ok: false, error: ZERO_YEAR_MESSAGE }

  const bc = negative || hasBc || (!hasAd && defaultEra === 'MÖ')
  const year = bc ? -n : n
  if (year < MIN_YEAR || year > MAX_YEAR) return { ok: false, error: RANGE_MESSAGE }
  return { ok: true, year }
}

/** Yazma alanının başlangıç içeriği: işaretsiz sayı + çağ anahtarı. */
export function yearToDraft(year: number): { text: string; era: Era } {
  return { text: String(Math.abs(year)), era: year < 0 ? 'MÖ' : 'MS' }
}
