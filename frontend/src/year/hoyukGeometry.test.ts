import { describe, expect, it } from 'vitest'
import { MAX_YEAR, MIN_YEAR } from '../lib/year'
import {
  displayYearAt,
  easeInOut,
  formatApproxYears,
  gaugeFractionToOffset,
  introDelay,
  jumpDuration,
  layerBands,
  offsetToYear,
  parallaxShift,
  pixelsPerYear,
  roundingStep,
  roundYear,
  screenLabel,
  starShift,
  TOTAL_HEIGHT,
  yearsPerScreen,
  yearToOffset,
} from './hoyukGeometry'

describe('yıl ↔ ofset', () => {
  it('yukarı gelecek, aşağı geçmiş', () => {
    expect(yearToOffset(MAX_YEAR)).toBeCloseTo(0, 6)
    expect(yearToOffset(MIN_YEAR)).toBeCloseTo(TOTAL_HEIGHT, 6)
    expect(yearToOffset(1453)).toBeGreaterThan(yearToOffset(2026))
    expect(yearToOffset(-1200)).toBeGreaterThan(yearToOffset(1453))
  })
  it('gidiş-dönüş', () => {
    for (const y of [MIN_YEAR, -9600, -1200, -1, 1, 1453, 1923, 2026, 2100, MAX_YEAR]) {
      expect(offsetToYear(yearToOffset(y))).toBe(y)
    }
  })
  it('kırpar ve 0 vermez', () => {
    expect(offsetToYear(-50)).toBe(MAX_YEAR)
    expect(offsetToYear(TOTAL_HEIGHT + 50)).toBe(MIN_YEAR)
    expect(offsetToYear(NaN)).not.toBe(0)
    expect(offsetToYear(yearToOffset(0))).not.toBe(0)
  })
  it('çözünürlük raporla uyumlu (bugün ~35 px/yıl, 1453 ~1,2, MS 1 ~0,34)', () => {
    expect(pixelsPerYear(2026)).toBeGreaterThan(30)
    expect(pixelsPerYear(2026)).toBeLessThan(40)
    expect(pixelsPerYear(1453)).toBeCloseTo(1.2, 1)
    expect(pixelsPerYear(1)).toBeCloseTo(0.34, 1)
    expect(1 / pixelsPerYear(-100000)).toBeGreaterThan(100)
  })
})

describe('gösterim yuvarlaması', () => {
  it('adımlar', () => {
    expect(roundingStep(0.03)).toBe(1)
    expect(roundingStep(1)).toBe(1)
    expect(roundingStep(3)).toBe(10)
    expect(roundingStep(145)).toBe(100)
  })
  it('roundYear 0 vermez, aralıkta kalır', () => {
    expect(roundYear(1453, 1)).toBe(1453)
    expect(roundYear(-9649, 100)).toBe(-9600)
    expect(roundYear(4, 10)).toBe(1)
    expect(roundYear(-4, 10)).toBe(-1)
    expect(roundYear(MAX_YEAR - 3, 100)).toBe(MAX_YEAR)
  })
  it('kaydırmada gösterilen yıl: yakında kesin, derin geçmişte 100lük', () => {
    expect(displayYearAt(yearToOffset(1453))).toBe(1453)
    expect(displayYearAt(yearToOffset(2026))).toBe(2026)
    expect(Math.abs(displayYearAt(yearToOffset(-50123)) % 100)).toBe(0)
    expect(displayYearAt(yearToOffset(-50123))).toBeCloseTo(-50100, -3)
  })
  it('her ofsette geçerli yıl', () => {
    const bad: number[] = []
    for (let o = 0; o <= TOTAL_HEIGHT; o += 7) {
      const y = displayYearAt(o)
      if (!Number.isInteger(y) || y === 0 || y < MIN_YEAR || y > MAX_YEAR) bad.push(o)
    }
    expect(bad).toEqual([])
  })
})

describe('1 ekran ≈ N yıl', () => {
  it('bugün yakınında az, derin geçmişte çok', () => {
    const near = yearsPerScreen(yearToOffset(2026), 800)
    const far = yearsPerScreen(yearToOffset(-50000), 800)
    expect(near).toBeGreaterThan(10)
    expect(near).toBeLessThan(60)
    expect(far).toBeGreaterThan(50000)
  })
  it('biçim', () => {
    expect(formatApproxYears(23.4)).toBe('23')
    expect(formatApproxYears(0.2)).toBe('1')
    expect(formatApproxYears(0)).toBe('0')
    expect(formatApproxYears(0.6)).toBe('1')
    expect(formatApproxYears(1234)).toBe('1.200')
    expect(formatApproxYears(45678)).toBe('46.000')
    expect(screenLabel(yearToOffset(-50000), 800)).toMatch(/^1 ekran ≈ [\d.]+ yıl$/)
  })
})

describe('katmanlar', () => {
  const bands = layerBands()
  it('15 katman, yukarıdan aşağı gelecekten geçmişe, boşluksuz ve toplam ≈12.000 px', () => {
    expect(bands).toHaveLength(15)
    expect(bands[0].period.id).toBe('uzak-gelecek')
    expect(bands[14].period.id).toBe('paleolitik')
    expect(bands[0].top).toBeCloseTo(0, 6)
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].top).toBeCloseTo(bands[i - 1].top + bands[i - 1].height, 6)
    }
    const sum = bands.reduce((s, b) => s + b.height, 0)
    expect(sum).toBeCloseTo(TOTAL_HEIGHT, 6)
  })
  it('logaritmik ölçek görünür: Erken Cumhuriyet+20. yy, Osmanlı ve Paleolitik benzer kalınlıkta', () => {
    const h = (id: string) => bands.find((b) => b.period.id === id)!.height
    const cumhuriyet = h('erken-cumhuriyet') + h('yirminci-yy-sonu')
    const osmanli = h('osmanli-klasik') + h('osmanli-gec')
    const paleo = h('paleolitik')
    for (const x of [cumhuriyet, osmanli, paleo]) {
      expect(x).toBeGreaterThan(400)
      expect(x).toBeLessThan(2000)
    }
  })
})

describe('animasyon zamanlaması', () => {
  it('atlama 700–1200 ms, mesafeyle artar; reduced motion anında', () => {
    expect(jumpDuration(10, false)).toBeGreaterThanOrEqual(700)
    expect(jumpDuration(TOTAL_HEIGHT, false)).toBe(1200)
    expect(jumpDuration(50000, false)).toBe(1200)
    expect(jumpDuration(5000, false)).toBeGreaterThan(jumpDuration(100, false))
    expect(jumpDuration(5000, true)).toBe(0)
    expect(jumpDuration(0, false)).toBe(0)
  })
  it('easeInOut uçlarda 0 ve 1, ortada 0,5', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9)
    expect(easeInOut(2)).toBe(1)
  })
  it('giriş gecikmeleri 40 ms arayla, toplam ≤1,2 sn', () => {
    expect(introDelay(0, 10)).toBe(0)
    expect(introDelay(8, 10)).toBe(40)
    expect(introDelay(9, 10)).toBe(80)
    for (let c = 0; c < 15; c++) {
      for (let i = 0; i < 15; i++) expect(introDelay(i, c) + 400).toBeLessThanOrEqual(1200)
    }
  })
  it('paralaks: çizgide 0, eserler 1,08× daha hızlı', () => {
    expect(parallaxShift(500, 500, 1.08)).toBe(0)
    expect(parallaxShift(600, 500, 1.08)).toBeCloseTo(-8, 9)
    expect(parallaxShift(400, 500, 1.08)).toBeCloseTo(8, 9)
  })
  it('yıldızlar 0,3× ve döşemede sarılır', () => {
    expect(starShift(0, 400)).toBe(0)
    expect(starShift(100, 400)).toBeCloseTo(-30, 9)
    expect(starShift(2000, 400)).toBeCloseTo(-200, 9)
    expect(starShift(-50, 400)).toBe(0)
  })
  it('derinlik göstergesi kesri', () => {
    expect(gaugeFractionToOffset(0)).toBe(0)
    expect(gaugeFractionToOffset(1)).toBe(TOTAL_HEIGHT)
    expect(gaugeFractionToOffset(-1)).toBe(0)
    expect(gaugeFractionToOffset(0.25)).toBe(3000)
  })
})
