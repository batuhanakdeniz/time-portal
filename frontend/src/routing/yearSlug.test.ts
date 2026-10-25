import { describe, expect, it } from 'vitest'
import { parseYearSlug, yearToSlug } from './yearSlug'

describe('yearToSlug', () => {
  it.each([
    [1453, '1453'],
    [2026, '2026'],
    [476, '476'],
    [1, '1'],
    [-1200, 'mo-1200'],
    [-1, 'mo-1'],
    [-100000, 'mo-100000'],
    [100000, '100000'],
  ])('%i → %s', (year, slug) => {
    expect(yearToSlug(year)).toBe(slug)
  })

  it.each([0, 1.5, Number.NaN, 100001, -100001])('geçersiz yılda (%s) hata verir', (year) => {
    expect(() => yearToSlug(year)).toThrow()
  })
})

describe('parseYearSlug', () => {
  it.each([
    ['1453', 1453],
    ['mo-1200', -1200],
    ['mo-100000', -100000],
    ['100000', 100000],
    ['1', 1],
  ])('kanonik %s → %i', (slug, year) => {
    expect(parseYearSlug(slug)).toEqual({ year, canonical: true })
  })

  it.each([
    ['-1200', -1200],
    ['01453', 1453],
    ['mo-01200', -1200],
  ])('kanonik olmayan %s → %i (yönlendirilir)', (slug, year) => {
    expect(parseYearSlug(slug)).toEqual({ year, canonical: false })
  })

  it.each([
    '0',
    'mo-0',
    '-0',
    '000',
    '100001',
    'mo-100001',
    '-100001',
    '9999999999',
    '',
    'abc',
    '14a',
    'mo-',
    'mo1200',
    'ms-1453',
    '+1453',
    '1453.5',
    ' 1453',
    'MO-1200',
  ])('geçersiz %j → null', (slug) => {
    expect(parseYearSlug(slug)).toBeNull()
  })

  it('undefined → null', () => {
    expect(parseYearSlug(undefined)).toBeNull()
  })

  it('yearToSlug ile gidiş-dönüş', () => {
    for (const y of [-100000, -1200, -1, 1, 476, 1453, 2026, 100000]) {
      expect(parseYearSlug(yearToSlug(y))).toEqual({ year: y, canonical: true })
    }
  })
})
