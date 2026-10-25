import { describe, expect, it } from 'vitest'
import { MAX_YEAR, MIN_YEAR } from '../lib/year'
import { bucketIndexOf, bucketOf, hasScene, periodBoundaryStep, periodNote, PERIODS } from './periods'

describe('PERIODS tablosu (FAZ3.md §2)', () => {
  it('15 kova, sözleşmedeki sırayla ve değerlerle', () => {
    expect(PERIODS.map((p) => [p.id, p.name, p.yearFrom, p.yearTo, p.confidence])).toEqual([
      ['paleolitik', 'Paleolitik ve buzul çağı', -100000, -10000, 'kurgu'],
      ['neolitik', 'Neolitik–Kalkolitik', -10000, -3000, 'kurgu'],
      ['tunc', 'Tunç Çağı', -3000, -1200, 'yorum'],
      ['demir', 'Demir Çağı', -1200, -550, 'yorum'],
      ['helenistik', 'Pers–Helenistik', -550, -30, 'yorum'],
      ['roma', 'Roma', -30, 395, 'yorum'],
      ['bizans', 'Bizans', 395, 1071, 'yorum'],
      ['selcuklu', 'Selçuklu–Beylikler', 1071, 1453, 'yorum'],
      ['osmanli-klasik', 'Osmanlı klasik', 1453, 1700, 'yorum'],
      ['osmanli-gec', 'Osmanlı geç', 1700, 1923, 'yorum'],
      ['erken-cumhuriyet', 'Erken Cumhuriyet', 1923, 1960, 'yorum'],
      ['yirminci-yy-sonu', '20. yüzyıl sonu', 1960, 2000, 'yorum'],
      ['bugun', 'Bugün', 2000, 2030, 'gercek'],
      ['yakin-gelecek', 'Yakın gelecek', 2030, 2200, 'kurgu'],
      ['uzak-gelecek', 'Uzak gelecek', 2200, 100001, 'kurgu'],
    ])
  })
  it('bitişik ve boşluksuz; tüm aralığı kapsar', () => {
    expect(PERIODS[0].yearFrom).toBe(MIN_YEAR)
    expect(PERIODS[PERIODS.length - 1].yearTo).toBe(MAX_YEAR + 1)
    for (let i = 1; i < PERIODS.length; i++) expect(PERIODS[i].yearFrom).toBe(PERIODS[i - 1].yearTo)
  })
  it('değiştirilemez', () => {
    expect(Object.isFrozen(PERIODS)).toBe(true)
    expect(Object.isFrozen(PERIODS[0])).toBe(true)
  })
})

describe('bucketOf', () => {
  it('başlangıç dahil, bitiş hariç', () => {
    expect(bucketOf(1453)?.id).toBe('osmanli-klasik')
    expect(bucketOf(1452)?.id).toBe('selcuklu')
    expect(bucketOf(2000)?.id).toBe('bugun')
    expect(bucketOf(1999)?.id).toBe('yirminci-yy-sonu')
    expect(bucketOf(2029)?.id).toBe('bugun')
    expect(bucketOf(2030)?.id).toBe('yakin-gelecek')
  })
  it('MÖ sınırları: MÖ 1200 Demir Çağı, MÖ 1201 Tunç', () => {
    expect(bucketOf(-1200)?.id).toBe('demir')
    expect(bucketOf(-1201)?.id).toBe('tunc')
    expect(bucketOf(-10000)?.id).toBe('neolitik')
    expect(bucketOf(-10001)?.id).toBe('paleolitik')
    expect(bucketOf(-30)?.id).toBe('roma')
    expect(bucketOf(-31)?.id).toBe('helenistik')
  })
  it('Roma kovası 0 yılını atlar: MÖ 1 ve MS 1 Roma', () => {
    expect(bucketOf(-1)?.id).toBe('roma')
    expect(bucketOf(1)?.id).toBe('roma')
  })
  it('yıl 0 ve geçersiz yıllar null (hata fırlatmaz)', () => {
    expect(bucketOf(0)).toBeNull()
    expect(bucketOf(1.5)).toBeNull()
    expect(bucketOf(NaN)).toBeNull()
    expect(bucketOf(MIN_YEAR - 1)).toBeNull()
    expect(bucketOf(MAX_YEAR + 1)).toBeNull()
    expect(bucketIndexOf(0)).toBe(-1)
  })
  it('uçlar dahil: MÖ 100.000 ve 100.000', () => {
    expect(bucketOf(MIN_YEAR)?.id).toBe('paleolitik')
    expect(bucketOf(MAX_YEAR)?.id).toBe('uzak-gelecek')
  })
})

describe('hasScene ve periodNote', () => {
  it('kurgu kovalar (1, 2, 14, 15) sahnesiz', () => {
    const without = PERIODS.filter((p) => !hasScene(p)).map((p) => p.id)
    expect(without).toEqual(['paleolitik', 'neolitik', 'yakin-gelecek', 'uzak-gelecek'])
  })
  it('notlar', () => {
    expect(periodNote(bucketOf(-50000)!)).toBe('Bu dönem için sahne henüz yok.')
    expect(periodNote(bucketOf(2026)!)).toBe('2026 görünümü.')
    expect(periodNote(bucketOf(1453)!)).toBe('Şimdilik 2026 görünümü; Osmanlı klasik sahnesi hazırlanıyor.')
  })
})

describe('periodBoundaryStep', () => {
  it('yukarı: sonraki dönemin başı', () => {
    expect(periodBoundaryStep(1500, 1)).toBe(1700)
    expect(periodBoundaryStep(1453, 1)).toBe(1700)
    expect(periodBoundaryStep(-5000, 1)).toBe(-3000)
    expect(periodBoundaryStep(50000, 1)).toBe(MAX_YEAR)
  })
  it('aşağı: kendi başı, zaten baştaysa öncekinin başı', () => {
    expect(periodBoundaryStep(1500, -1)).toBe(1453)
    expect(periodBoundaryStep(1453, -1)).toBe(1071)
    expect(periodBoundaryStep(-1200, -1)).toBe(-3000)
    expect(periodBoundaryStep(-50000, -1)).toBe(MIN_YEAR)
    expect(periodBoundaryStep(MIN_YEAR, -1)).toBe(MIN_YEAR)
  })
})
