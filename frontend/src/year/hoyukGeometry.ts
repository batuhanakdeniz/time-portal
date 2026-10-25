/**
 * Höyük kesitinin saf geometri ve zamanlama hesapları.
 * jsdom'da yerleşim olmadığı için kaydırma ↔ yıl eşlemesi burada, DOM'suz test edilir.
 *
 * Koordinat: "ofset" kesitin tepesinden aşağı piksel. 0 = 100.000 (en uzak gelecek), TOTAL = MÖ 100.000.
 * Kaydırma kabının üstünde ve altında yarım ekranlık boşluk olduğundan, okuma çizgisi (ekranın ortası)
 * altındaki ofset tam olarak `scrollTop`'tur.
 */
import { MAX_YEAR, MIN_YEAR } from '../lib/year'
import { positionToYear, yearToPosition } from '../timeline/scale'
import { PERIODS, type Period } from './periods'

/** Kesitin toplam yüksekliği (px). Rapor C §3: ≈12.000 px, mobilde ~14 ekran. */
export const TOTAL_HEIGHT = 12000

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Yıl → kesitteki ofset (px). Yukarı gelecek, aşağı geçmiş; `scale.ts` logaritmik ölçeği. */
export function yearToOffset(year: number, total = TOTAL_HEIGHT): number {
  return (1 - yearToPosition(year)) * total
}

/** Ofset (px) → geçerli tamsayı yıl (0 asla). */
export function offsetToYear(offset: number, total = TOTAL_HEIGHT): number {
  const o = Number.isFinite(offset) ? clamp(offset, 0, total) : total / 2
  return positionToYear(1 - o / total)
}

/** Yılın çevresinde 1 yıl kaç piksel (yerel çözünürlük). */
export function pixelsPerYear(year: number, total = TOTAL_HEIGHT): number {
  const h = Math.max(0.5, Math.abs(year) * 1e-4)
  const lo = clamp(year - h, MIN_YEAR, MAX_YEAR)
  const hi = clamp(year + h, MIN_YEAR, MAX_YEAR)
  return (yearToOffset(lo, total) - yearToOffset(hi, total)) / (hi - lo)
}

/** Gösterim yuvarlaması: piksel başına yıl ≤1 → 1, ≤10 → 10, fazlası (derin geçmiş/gelecek) → 100. */
export function roundingStep(yearsPerPixel: number): 1 | 10 | 100 {
  if (yearsPerPixel <= 1) return 1
  if (yearsPerPixel <= 10) return 10
  return 100
}

/** Yılı adıma yuvarlar; 0'a düşerse işaretine göre MÖ 1 / MS 1, aralıkta kalır. */
export function roundYear(year: number, step: number): number {
  if (step <= 1) return year
  const r = clamp(Math.round(year / step) * step, MIN_YEAR, MAX_YEAR)
  if (r !== 0) return r
  return year < 0 ? -1 : 1
}

/** Kaydırma sırasında hapta gösterilen yıl: çözünürlüğe göre yuvarlanmış. */
export function displayYearAt(offset: number, total = TOTAL_HEIGHT): number {
  const raw = offsetToYear(offset, total)
  return roundYear(raw, roundingStep(1 / pixelsPerYear(raw, total)))
}

/** Okuma çizgisi `scrollTop`'tayken bir ekranın kapsadığı yıl sayısı. */
export function yearsPerScreen(scrollTop: number, viewportHeight: number, total = TOTAL_HEIGHT): number {
  const top = offsetToYear(scrollTop - viewportHeight / 2, total)
  const bottom = offsetToYear(scrollTop + viewportHeight / 2, total)
  // Yıl 0 olmadığından MÖ→MS geçişinde bir eksik say.
  return Math.max(0, top - bottom - (bottom < 0 && top > 0 ? 1 : 0))
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** "1 ekran ≈ N yıl" için yaklaşık sayı: 2 anlamlı basamak, binlik nokta. */
export function formatApproxYears(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 100) return String(Math.max(1, Math.round(n)))
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1)
  return group(Math.round(n / mag) * mag)
}

/** "1 ekran ≈ N yıl" etiketi. */
export function screenLabel(scrollTop: number, viewportHeight: number, total = TOTAL_HEIGHT): string {
  return `1 ekran ≈ ${formatApproxYears(yearsPerScreen(scrollTop, viewportHeight, total))} yıl`
}

export interface LayerBand {
  period: Period
  /** Kronolojik sıra (0 = paleolitik). */
  index: number
  top: number
  height: number
}

/** Dönem katmanları yukarıdan aşağı (gelecek → geçmiş); kalınlıklar logaritmik ölçekten. */
export function layerBands(total = TOTAL_HEIGHT): LayerBand[] {
  return PERIODS.map((period, index) => {
    const top = yearToOffset(Math.min(period.yearTo, MAX_YEAR), total)
    const bottom = yearToOffset(period.yearFrom, total)
    return { period, index, top, height: bottom - top }
  }).reverse()
}

/** Programatik atlama ("kazı uçuşu") süresi: 700–1200 ms, mesafenin logaritmasıyla; reduced motion'da 0. */
export function jumpDuration(distancePx: number, reducedMotion: boolean, total = TOTAL_HEIGHT): number {
  const d = Math.abs(distancePx)
  if (reducedMotion || !(d >= 1)) return 0
  return Math.round(700 + 500 * Math.min(1, Math.log1p(d) / Math.log1p(total)))
}

/** ease-in-out (kübik). */
export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/**
 * Paralaks kayması (px): `factor` hızla kayan öğe için ek `translateY`.
 * Öğe merkezi okuma çizgisindeyken (scrollTop = centerOffset) kayma 0.
 */
export function parallaxShift(scrollTop: number, centerOffset: number, factor: number): number {
  return (factor - 1) * (centerOffset - scrollTop)
}

/** Yıldız katmanı (0,3×) için döşeme yüksekliğiyle sarılmış kayma (px, ≤ 0). */
export function starShift(scrollTop: number, tileHeight: number, factor = 0.3): number {
  const s = (factor * Math.max(0, scrollTop)) % tileHeight
  return s === 0 ? 0 : -s
}

export const INTRO_STAGGER_MS = 40
export const INTRO_TOTAL_MS = 1200

/**
 * Giriş animasyonunda katmanın gecikmesi: alttan yukarı 40 ms arayla.
 * Ekranın altında kalan (o anki dönemden 3+ eski) katmanlar hemen, yukarıdakiler sırayla yükselir.
 */
export function introDelay(index: number, currentIndex: number): number {
  return INTRO_STAGGER_MS * clamp(index - (currentIndex - 3), 0, 12)
}

/** Derinlik göstergesinde (0 = üst/gelecek, 1 = alt/geçmiş) kesir → kaydırma ofseti. */
export function gaugeFractionToOffset(fraction: number, total = TOTAL_HEIGHT): number {
  return clamp(Number.isFinite(fraction) ? fraction : 0.5, 0, 1) * total
}
