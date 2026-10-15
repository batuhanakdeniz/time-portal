import { describe, expect, it } from 'vitest'
import { MAX_YEAR, MIN_YEAR } from '../lib/year'
import {
  clampView,
  FULL_VIEW,
  MIN_YEAR_SPAN,
  yearSpan,
  panView,
  positionToYear,
  stepYear,
  yearToPosition,
  zoomView,
} from './scale'

const samples = [MIN_YEAR, -50000, -12000, -2500, -44, -1, 1, 476, 1453, 1900, 2026, 2150, 5000, 50000, MAX_YEAR]

describe('yearToPosition', () => {
  it('uçlar 0 ve 1', () => {
    expect(yearToPosition(MIN_YEAR)).toBeCloseTo(0, 12)
    expect(yearToPosition(MAX_YEAR)).toBeCloseTo(1, 12)
  })
  it('monoton artan', () => {
    for (let i = 1; i < samples.length; i++) {
      expect(yearToPosition(samples[i])).toBeGreaterThan(yearToPosition(samples[i - 1]))
    }
  })
  it('günümüze yakın yıllar daha çok yer kaplar', () => {
    const near = yearToPosition(2026) - yearToPosition(1926)
    const far = yearToPosition(-50000) - yearToPosition(-50100)
    expect(near).toBeGreaterThan(far * 10)
  })
  it('aralık dışını kırpar', () => {
    expect(yearToPosition(MAX_YEAR + 500)).toBe(1)
    expect(yearToPosition(MIN_YEAR - 500)).toBe(0)
  })
})

describe('positionToYear', () => {
  it('gidiş-dönüş', () => {
    for (const y of samples) {
      expect(positionToYear(yearToPosition(y))).toBe(y)
    }
  })
  it('yakın yıllarda her yıl için gidiş-dönüş', () => {
    for (let y = 1800; y <= 2200; y++) expect(positionToYear(yearToPosition(y))).toBe(y)
    for (let y = -300; y <= -1; y++) expect(positionToYear(yearToPosition(y))).toBe(y)
  })
  it('her konumda geçerli, monoton tamsayı yıl döner; asla 0 değil', () => {
    let prev = MIN_YEAR
    for (let i = 0; i <= 200000; i++) {
      const y = positionToYear(i / 200000)
      expect(Number.isInteger(y)).toBe(true)
      expect(y).not.toBe(0)
      expect(y).toBeGreaterThanOrEqual(MIN_YEAR)
      expect(y).toBeLessThanOrEqual(MAX_YEAR)
      expect(y).toBeGreaterThanOrEqual(prev)
      prev = y
    }
  })
  it('yıl 0 konumu tutarlı biçimde 1 yılına çevrilir', () => {
    expect(positionToYear(yearToPosition(0))).toBe(1)
  })
  it('aralık dışı ve NaN konumlar geçerli yıl döner', () => {
    expect(positionToYear(-3)).toBe(MIN_YEAR)
    expect(positionToYear(7)).toBe(MAX_YEAR)
    expect(positionToYear(NaN)).not.toBe(0)
  })
})

describe('stepYear', () => {
  it('0 yılını atlar', () => {
    expect(stepYear(1, -1)).toBe(-1)
    expect(stepYear(-1, 1)).toBe(1)
    expect(stepYear(5, -10)).toBe(-6)
    expect(stepYear(-5, 10)).toBe(6)
  })
  it('sınırlarda kalır', () => {
    expect(stepYear(MAX_YEAR, 10)).toBe(MAX_YEAR)
    expect(stepYear(MIN_YEAR, -10)).toBe(MIN_YEAR)
  })
})

describe('görünüm penceresi', () => {
  it('tam görünüm 0..1', () => {
    expect(FULL_VIEW).toEqual({ start: 0, end: 1 })
  })
  it('clampView sınırların dışına çıkmaz ve genişliği korur', () => {
    const v = clampView({ start: -0.2, end: 0.3 })
    expect(v.start).toBe(0)
    expect(v.end).toBeCloseTo(0.5, 12)
    const w = clampView({ start: 0.8, end: 1.3 })
    expect(w.end).toBe(1)
    expect(w.start).toBeCloseTo(0.5, 12)
  })
  it('panView sınırın ötesine kaydırmaz', () => {
    const v = panView({ start: 0.2, end: 0.4 }, 5)
    expect(v.end).toBe(1)
    expect(v.end - v.start).toBeCloseTo(0.2, 12)
    expect(panView({ start: 0.2, end: 0.4 }, -5).start).toBe(0)
  })
  it('zoomView odak noktasını sabit tutar', () => {
    const v = zoomView({ start: 0, end: 1 }, 0.5, 0.5)
    expect(v.end - v.start).toBeCloseTo(0.5, 12)
    expect((0.5 - v.start) / (v.end - v.start)).toBeCloseTo(0.5, 12)
  })
  it('maksimum yakınlaştırma her yerde en az 20 yıl kapsar (2026 ve uçlar dahil)', () => {
    const foci = [0, yearToPosition(-44), yearToPosition(1), yearToPosition(2026), 0.3, 1]
    for (const focus of foci) {
      let v = FULL_VIEW
      for (let i = 0; i < 100; i++) v = zoomView(v, focus, 0.5)
      expect(yearSpan(v)).toBeGreaterThanOrEqual(MIN_YEAR_SPAN)
      expect(yearSpan(v)).toBeLessThan(200)
      expect(v.start).toBeGreaterThanOrEqual(0)
      expect(v.end).toBeLessThanOrEqual(1)
    }
  })
  it('zoomView tam görünümden fazla uzaklaştırmaz, çok da yakınlaştırmaz', () => {
    expect(zoomView(FULL_VIEW, 0.3, 10)).toEqual({ start: 0, end: 1 })
    const z = zoomView({ start: 0.4, end: 0.5 }, 0.45, 1e-9)
    expect(z.end - z.start).toBeGreaterThan(0)
    expect(z.start).toBeGreaterThanOrEqual(0)
    expect(z.end).toBeLessThanOrEqual(1)
  })
})
