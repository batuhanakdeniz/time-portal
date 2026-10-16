import { MAX_YEAR } from '../lib/year'
import { PRESENT_YEAR, positionToYear, yearToPosition } from './scale'
import type { View } from './scale'

export interface Tick {
  year: number
  /** Pencerede soldan yüzde. */
  left: number
  /** Kenara yakın etiketler taşmasın diye hizalama. */
  align: 'start' | 'center' | 'end'
}

// Kaba -> ince "güzel" adımlar: 100000, 50000, ..., 2, 1
const STEPS: number[] = (() => {
  const out: number[] = []
  for (let m = MAX_YEAR; m >= 1; m /= 10) out.push(m, m / 2, m / 5)
  return out.filter((s) => Number.isInteger(s))
})()

/** [lo, hi] aralığında (0 hariç) en kaba güzel adımın bir katını bulur. */
function coarsestNiceYear(lo: number, hi: number): number | null {
  for (const s of STEPS) {
    let m = Math.ceil(lo / s) * s
    if (m === 0) m += s
    if (m <= hi) return m
  }
  return null
}

/**
 * Görünür pencere için eksen etiketleri. Ekran genişliği ~minGapPx'lik dilimlere bölünür;
 * her dilimde o dilimin yerel yıl aralığına uygun en kaba 1-2-5·10^k yılı seçilir.
 * Etiketler en az minGapPx arayla, artan sırada; yıl 0 asla yok; günümüz (2026) görünürse önceliklidir.
 */
export function computeTicks(view: View, width: number, minGapPx = 72, edgePx = 48): Tick[] {
  const span = view.end - view.start
  const slots = Math.max(1, Math.floor(width / minGapPx))
  const xOf = (year: number) => ((yearToPosition(year) - view.start) / span) * width

  const candidates: number[] = []
  for (let i = 0; i < slots; i++) {
    const lo = positionToYear(view.start + (span * i) / slots)
    const hi = positionToYear(view.start + (span * (i + 1)) / slots)
    const year = coarsestNiceYear(i === 0 ? lo : lo + 1, hi)
    if (year !== null) candidates.push(year)
  }

  const kept: { year: number; x: number }[] = []
  const tryAdd = (year: number) => {
    const x = xOf(year)
    if (kept.every((k) => Math.abs(k.x - x) >= minGapPx)) kept.push({ year, x })
  }
  const presentPos = yearToPosition(PRESENT_YEAR)
  if (presentPos >= view.start && presentPos <= view.end) tryAdd(PRESENT_YEAR)
  for (const y of candidates) tryAdd(y)

  return kept
    .sort((a, b) => a.year - b.year)
    .map(({ year, x }) => ({
      year,
      left: (x / width) * 100,
      align: x < edgePx ? 'start' : x > width - edgePx ? 'end' : 'center',
    }))
}
