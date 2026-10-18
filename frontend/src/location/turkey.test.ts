import { describe, expect, it } from 'vitest'
import { TURKEY_BOUNDS, isInTurkeyBounds } from './turkey'

describe('isInTurkeyBounds', () => {
  it.each([
    ['Ankara', 39.93, 32.86],
    ['İstanbul', 41.01, 28.98],
    ['Hakkari', 37.57, 43.74],
    ['Edirne', 41.67, 26.56],
  ])('%s içeride', (_n, la, lo) => {
    expect(isInTurkeyBounds(la, lo)).toBe(true)
  })

  it.each([
    ['Atina', 37.98, 23.73],
    ['Tebriz', 38.08, 46.29],
    ['Lefkoşa', 35.18, 33.38],
    ['Bağdat', 33.31, 44.36],
  ])('%s dışarıda', (_n, la, lo) => {
    expect(isInTurkeyBounds(la, lo)).toBe(false)
  })

  it('sınır köşeleri dahil', () => {
    const [[w, s], [e, n]] = TURKEY_BOUNDS
    for (const [la, lo] of [[s, w], [s, e], [n, w], [n, e]]) {
      expect(isInTurkeyBounds(la, lo)).toBe(true)
    }
    expect(isInTurkeyBounds(s - 0.001, w)).toBe(false)
    expect(isInTurkeyBounds(n, e + 0.001)).toBe(false)
  })

  it('sayı olmayan veya sonsuz değer false', () => {
    expect(isInTurkeyBounds(NaN, 30)).toBe(false)
    expect(isInTurkeyBounds(39, NaN)).toBe(false)
    expect(isInTurkeyBounds(Infinity, 30)).toBe(false)
    expect(isInTurkeyBounds(39, -Infinity)).toBe(false)
  })
})
