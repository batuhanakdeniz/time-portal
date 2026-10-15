import { describe, expect, it } from 'vitest'
import { clampLatitude, formatCoordinates, normalizeLongitude, toSelection } from './coordinates'

describe('normalizeLongitude', () => {
  it('aralık içindeki değeri değiştirmez', () => {
    expect(normalizeLongitude(0)).toBe(0)
    expect(normalizeLongitude(12.5)).toBe(12.5)
    expect(normalizeLongitude(180)).toBe(180)
    expect(normalizeLongitude(-180)).toBe(-180)
  })

  it('dışındaki değeri sarar', () => {
    expect(normalizeLongitude(190)).toBe(-170)
    expect(normalizeLongitude(-190)).toBe(170)
    expect(normalizeLongitude(360)).toBe(0)
    expect(normalizeLongitude(-540)).toBe(-180)
    expect(normalizeLongitude(540)).toBe(-180)
  })
})

describe('clampLatitude', () => {
  it('sınırlara sıkıştırır', () => {
    expect(clampLatitude(95)).toBe(90)
    expect(clampLatitude(-95)).toBe(-90)
    expect(clampLatitude(41.9)).toBe(41.9)
  })
})

describe('toSelection', () => {
  it('4 ondalığa yuvarlar', () => {
    expect(toSelection(41.900049, 12.500051)).toEqual({ latitude: 41.9, longitude: 12.5001 })
  })

  it('boylamı sarar, enlemi sıkıştırır', () => {
    expect(toSelection(95, 190)).toEqual({ latitude: 90, longitude: -170 })
  })

  it('sınır değerleri korur', () => {
    expect(toSelection(-90, -180)).toEqual({ latitude: -90, longitude: -180 })
    expect(toSelection(90, 180)).toEqual({ latitude: 90, longitude: 180 })
  })

  it('negatif sıfır üretmez', () => {
    expect(Object.is(toSelection(-0.00001, -0.00001).latitude, 0)).toBe(true)
  })

  it('NaN ve sonsuzda hata fırlatır', () => {
    expect(() => toSelection(NaN, 0)).toThrow()
    expect(() => toSelection(0, Infinity)).toThrow()
    expect(() => toSelection(-Infinity, 0)).toThrow()
  })
})

describe('formatCoordinates', () => {
  it('kuzey-doğu', () => {
    expect(formatCoordinates({ latitude: 41.9, longitude: 12.5 })).toBe('41.9000° K, 12.5000° D')
  })

  it('güney-batı', () => {
    expect(formatCoordinates({ latitude: -33.8688, longitude: -70.5 })).toBe('33.8688° G, 70.5000° B')
  })
})
