import { MAX_YEAR, MIN_YEAR } from '../lib/year'

/** Sahnenin dayanağı: gerçek (bugün), yorum (tarihsel yorum), kurgu (sahne henüz yok). */
export type PeriodConfidence = 'gercek' | 'yorum' | 'kurgu'

export interface Period {
  id: string
  name: string
  /** Başlangıç (dahil). */
  yearFrom: number
  /** Bitiş (hariç). */
  yearTo: number
  confidence: PeriodConfidence
}

/**
 * Dönem kovaları: docs/FAZ3.md §2 tablosu birebir (backend ile aynı).
 * Eskiden yeniye sıralı; aralıklar bitişik ve boşluksuz. Kimlikler değişmez.
 */
export const PERIODS: readonly Period[] = Object.freeze([
  { id: 'paleolitik', name: 'Paleolitik ve buzul çağı', yearFrom: -100000, yearTo: -10000, confidence: 'kurgu' },
  { id: 'neolitik', name: 'Neolitik–Kalkolitik', yearFrom: -10000, yearTo: -3000, confidence: 'kurgu' },
  { id: 'tunc', name: 'Tunç Çağı', yearFrom: -3000, yearTo: -1200, confidence: 'yorum' },
  { id: 'demir', name: 'Demir Çağı', yearFrom: -1200, yearTo: -550, confidence: 'yorum' },
  { id: 'helenistik', name: 'Pers–Helenistik', yearFrom: -550, yearTo: -30, confidence: 'yorum' },
  { id: 'roma', name: 'Roma', yearFrom: -30, yearTo: 395, confidence: 'yorum' },
  { id: 'bizans', name: 'Bizans', yearFrom: 395, yearTo: 1071, confidence: 'yorum' },
  { id: 'selcuklu', name: 'Selçuklu–Beylikler', yearFrom: 1071, yearTo: 1453, confidence: 'yorum' },
  { id: 'osmanli-klasik', name: 'Osmanlı klasik', yearFrom: 1453, yearTo: 1700, confidence: 'yorum' },
  { id: 'osmanli-gec', name: 'Osmanlı geç', yearFrom: 1700, yearTo: 1923, confidence: 'yorum' },
  { id: 'erken-cumhuriyet', name: 'Erken Cumhuriyet', yearFrom: 1923, yearTo: 1960, confidence: 'yorum' },
  { id: 'yirminci-yy-sonu', name: '20. yüzyıl sonu', yearFrom: 1960, yearTo: 2000, confidence: 'yorum' },
  { id: 'bugun', name: 'Bugün', yearFrom: 2000, yearTo: 2030, confidence: 'gercek' },
  { id: 'yakin-gelecek', name: 'Yakın gelecek', yearFrom: 2030, yearTo: 2200, confidence: 'kurgu' },
  { id: 'uzak-gelecek', name: 'Uzak gelecek', yearFrom: 2200, yearTo: 100001, confidence: 'kurgu' },
].map((p) => Object.freeze(p as Period)))

const isValidYear = (year: number) =>
  Number.isInteger(year) && year !== 0 && year >= MIN_YEAR && year <= MAX_YEAR

/** Yılın sıra numarası (0 tabanlı); geçersiz yılda -1. */
export function bucketIndexOf(year: number): number {
  if (!isValidYear(year)) return -1
  return PERIODS.findIndex((p) => year >= p.yearFrom && year < p.yearTo)
}

/**
 * Yılın dönem kovası: başlangıç dahil, bitiş hariç.
 * Geçersiz yılda (0, tamsayı olmayan, MÖ 100.000 – 100.000 dışı) **null** döner, hata fırlatmaz.
 */
export function bucketOf(year: number): Period | null {
  const i = bucketIndexOf(year)
  return i < 0 ? null : PERIODS[i]
}

/** Bu dönem için sahne üretiliyor mu? Kurgu dönemlerde (1, 2, 14, 15) "sahne henüz yok". */
export function hasScene(period: Period): boolean {
  return period.confidence !== 'kurgu'
}

/**
 * PgUp/PgDn için dönem sınırına atlama.
 * Yukarı (+1): bir sonraki dönemin başlangıcı; son dönemde aralığın sonu (100.000).
 * Aşağı (-1): dönemin başında değilse kendi başlangıcı, başındaysa bir önceki dönemin başlangıcı;
 * ilk dönemde aralığın başı (MÖ 100.000).
 */
export function periodBoundaryStep(year: number, direction: 1 | -1): number {
  const i = bucketIndexOf(year)
  if (i < 0) return year
  const p = PERIODS[i]
  if (direction > 0) return i + 1 < PERIODS.length ? PERIODS[i + 1].yearFrom : MAX_YEAR
  if (year > p.yearFrom) return p.yearFrom
  return i > 0 ? PERIODS[i - 1].yearFrom : MIN_YEAR
}

/** Arayüz notu (FAZ3.md §2, MVP davranışı). */
export function periodNote(period: Period): string {
  switch (period.confidence) {
    case 'kurgu':
      return 'Bu dönem için sahne henüz yok.'
    case 'gercek':
      return '2026 görünümü.'
    default:
      return `Şimdilik 2026 görünümü; ${period.name} sahnesi hazırlanıyor.`
  }
}
