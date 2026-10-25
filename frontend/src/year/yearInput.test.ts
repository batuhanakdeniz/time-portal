import { describe, expect, it } from 'vitest'
import {
  CONFLICT_MESSAGE,
  EMPTY_MESSAGE,
  INVALID_MESSAGE,
  parseYearInput,
  RANGE_MESSAGE,
  yearToDraft,
  ZERO_YEAR_MESSAGE,
} from './yearInput'

const ok = (year: number) => ({ ok: true, year })

describe('parseYearInput', () => {
  it('sözleşmedeki yazımlar', () => {
    expect(parseYearInput('-1200')).toEqual(ok(-1200))
    expect(parseYearInput('MÖ 1200')).toEqual(ok(-1200))
    expect(parseYearInput('1.200 MÖ')).toEqual(ok(-1200))
    expect(parseYearInput('m.ö. 1200')).toEqual(ok(-1200))
    expect(parseYearInput('MS 1453')).toEqual(ok(1453))
    expect(parseYearInput('1453')).toEqual(ok(1453))
  })
  it('diğer kabul edilen biçimler', () => {
    expect(parseYearInput('  M.Ö. 9.600 ')).toEqual(ok(-9600))
    expect(parseYearInput('mö9600')).toEqual(ok(-9600))
    expect(parseYearInput('MO 44')).toEqual(ok(-44))
    expect(parseYearInput('m.s. 476')).toEqual(ok(476))
    expect(parseYearInput('1453 MS')).toEqual(ok(1453))
    expect(parseYearInput('12 000')).toEqual(ok(12000))
    expect(parseYearInput('100.000')).toEqual(ok(100000))
    expect(parseYearInput('−500')).toEqual(ok(-500))
    expect(parseYearInput('-MÖ 5')).toEqual(ok(-5))
    expect(parseYearInput('MÖ -1200')).toEqual(ok(-1200))
    expect(parseYearInput('m.ö. − 1.200')).toEqual(ok(-1200))
  })
  it('MÖ/MS anahtarı yalnızca çağ yazılmadıysa uygulanır', () => {
    expect(parseYearInput('1200', 'MÖ')).toEqual(ok(-1200))
    expect(parseYearInput('1200', 'MS')).toEqual(ok(1200))
    expect(parseYearInput('MS 1200', 'MÖ')).toEqual(ok(1200))
    expect(parseYearInput('-1200', 'MS')).toEqual(ok(-1200))
  })
  it('0 yılı yok', () => {
    expect(parseYearInput('0')).toEqual({ ok: false, error: ZERO_YEAR_MESSAGE })
    expect(parseYearInput('MÖ 0')).toEqual({ ok: false, error: ZERO_YEAR_MESSAGE })
    expect(parseYearInput('-0')).toEqual({ ok: false, error: ZERO_YEAR_MESSAGE })
    expect(ZERO_YEAR_MESSAGE).toBe('0 yılı yok: MÖ 1 ya da MS 1')
  })
  it('aralık dışı', () => {
    expect(parseYearInput('100001')).toEqual({ ok: false, error: RANGE_MESSAGE })
    expect(parseYearInput('MÖ 100.001')).toEqual({ ok: false, error: RANGE_MESSAGE })
    expect(parseYearInput('99999999999999999999')).toEqual({ ok: false, error: RANGE_MESSAGE })
    expect(RANGE_MESSAGE).toBe('Yıl MÖ 100.000 ile 100.000 arasında olmalı.')
  })
  it('boş, anlamsız ve çelişkili girdiler', () => {
    expect(parseYearInput('   ')).toEqual({ ok: false, error: EMPTY_MESSAGE })
    expect(parseYearInput('abc')).toEqual({ ok: false, error: INVALID_MESSAGE })
    expect(parseYearInput('14.53')).toEqual({ ok: false, error: INVALID_MESSAGE })
    expect(parseYearInput('1453.5')).toEqual({ ok: false, error: INVALID_MESSAGE })
    expect(parseYearInput('MÖ')).toEqual({ ok: false, error: INVALID_MESSAGE })
    expect(parseYearInput('MÖ 12 MS')).toEqual({ ok: false, error: CONFLICT_MESSAGE })
    expect(parseYearInput('-12 MS')).toEqual({ ok: false, error: CONFLICT_MESSAGE })
    expect(parseYearInput('MS -1200')).toEqual({ ok: false, error: CONFLICT_MESSAGE })
    expect(parseYearInput('--1200')).toEqual({ ok: false, error: INVALID_MESSAGE })
  })
})

describe('yearToDraft', () => {
  it('işaretsiz sayı ve çağ', () => {
    expect(yearToDraft(-1200)).toEqual({ text: '1200', era: 'MÖ' })
    expect(yearToDraft(1453)).toEqual({ text: '1453', era: 'MS' })
  })
})
