import { MAX_YEAR, MIN_YEAR } from '../lib/year'

/** Ölçeğin merkezi: günümüze yakın yıllar en çok yeri kaplar. */
export const PRESENT_YEAR = 2026

/** Logaritmanın "diz" noktası: günümüzden ~K yıl uzaklığa kadar eşleme yaklaşık doğrusaldır. */
const K = 20

/** Görünür pencerenin en küçük genişliği (konum biriminde). */
export const MIN_SPAN = 1e-6

export interface View {
  start: number
  end: number
}

export const FULL_VIEW: View = { start: 0, end: 1 }

// Günümüzden işaretli uzaklığın logaritmik eşlemesi: f(d) = sign(d) * ln(1 + |d| / K)
const f = (d: number) => Math.sign(d) * Math.log1p(Math.abs(d) / K)
const fInv = (v: number) => Math.sign(v) * K * Math.expm1(Math.abs(v))

const F_MIN = f(MIN_YEAR - PRESENT_YEAR)
const F_MAX = f(MAX_YEAR - PRESENT_YEAR)

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Yıl → konum (0..1). Monoton artan; aralık dışı yıllar kırpılır. */
export function yearToPosition(year: number): number {
  const y = clamp(year, MIN_YEAR, MAX_YEAR)
  return clamp((f(y - PRESENT_YEAR) - F_MIN) / (F_MAX - F_MIN), 0, 1)
}

/** Konum (0..1) → geçerli yıl: tamsayı, aralık içinde, asla 0 değil (0 → 1). */
export function positionToYear(position: number): number {
  const p = Number.isFinite(position) ? clamp(position, 0, 1) : 0.5
  const year = Math.round(PRESENT_YEAR + fInv(F_MIN + p * (F_MAX - F_MIN)))
  const inRange = clamp(year, MIN_YEAR, MAX_YEAR)
  return inRange === 0 ? 1 : inRange
}

/** Yılı `delta` kadar kaydırır; yıl 0'ı atlar, aralıkta kalır. */
export function stepYear(year: number, delta: number): number {
  let next = year + delta
  if (year < 0 && next >= 0) next += 1
  else if (year > 0 && next <= 0) next -= 1
  next = clamp(next, MIN_YEAR, MAX_YEAR)
  return next === 0 ? (delta < 0 ? -1 : 1) : next
}

/** Pencereyi genişliğini koruyarak 0..1 içine iter. */
export function clampView(view: View): View {
  const span = clamp(view.end - view.start, MIN_SPAN, 1)
  const start = clamp(view.start, 0, 1 - span)
  return { start, end: start + span }
}

/** Pencereyi `delta` (konum birimi) kaydırır; sınırlardan taşmaz. */
export function panView(view: View, delta: number): View {
  return clampView({ start: view.start + delta, end: view.end + delta })
}

/**
 * Pencereyi `focus` konumu sabit kalacak şekilde ölçekler.
 * factor < 1 yakınlaştırır, > 1 uzaklaştırır.
 */
export function zoomView(view: View, focus: number, factor: number): View {
  const span = clamp((view.end - view.start) * factor, MIN_SPAN, 1)
  const ratio = (focus - view.start) / (view.end - view.start)
  const start = focus - ratio * span
  return clampView({ start, end: start + span })
}
