import { describe, expect, it } from 'vitest'
import { formatYear, MAX_YEAR, MIN_YEAR } from './year'

describe('formatYear', () => {
  it('MÖ yılları', () => {
    expect(formatYear(-44)).toBe('MÖ 44')
    expect(formatYear(-1)).toBe('MÖ 1')
    expect(formatYear(-12000)).toBe('MÖ 12.000')
    expect(formatYear(-100000)).toBe('MÖ 100.000')
  })
  it('1-999 arası MS ön ekli', () => {
    expect(formatYear(1)).toBe('MS 1')
    expect(formatYear(476)).toBe('MS 476')
    expect(formatYear(999)).toBe('MS 999')
  })
  it('1000 ve üstü ön eksiz, 5 haneden sonra binlik ayırıcı', () => {
    expect(formatYear(1000)).toBe('1000')
    expect(formatYear(1453)).toBe('1453')
    expect(formatYear(2150)).toBe('2150')
    expect(formatYear(12000)).toBe('12.000')
    expect(formatYear(100000)).toBe('100.000')
  })
  it('yıl 0 ve tamsayı olmayan değer hata fırlatır', () => {
    expect(() => formatYear(0)).toThrow()
    expect(() => formatYear(1.5)).toThrow()
    expect(() => formatYear(NaN)).toThrow()
  })
  it('sabitler backend ile aynı', () => {
    expect(MIN_YEAR).toBe(-100000)
    expect(MAX_YEAR).toBe(100000)
  })
})
