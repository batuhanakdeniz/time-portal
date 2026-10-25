import { describe, expect, it } from 'vitest'
import { parsePlaceSlug } from './placeSlug'

describe('parsePlaceSlug', () => {
  it('yalnızca il: "34" → {plate:"34"}', () => {
    expect(parsePlaceSlug('34')).toEqual({ plate: '34' })
  })

  it('il + ilçe: "34-beyoglu" → {plate:"34", district:"beyoglu"}', () => {
    expect(parsePlaceSlug('34-beyoglu')).toEqual({ plate: '34', district: 'beyoglu' })
  })

  it.each([
    ['06-merkez', { plate: '06', district: 'merkez' }],
    ['28-sebinkarahisar', { plate: '28', district: 'sebinkarahisar' }],
    ['34-kucuk-cekmece', { plate: '34', district: 'kucuk-cekmece' }],
    ['01', { plate: '01' }],
    ['81-duzce2', { plate: '81', district: 'duzce2' }],
  ])('%s', (slug, expected) => {
    expect(parsePlaceSlug(slug)).toEqual(expected)
  })

  it.each([
    '',
    '3',
    '034',
    '3a',
    'ab',
    '34-',
    '34--beyoglu',
    '34-beyoglu-',
    '34-Beyoglu',
    '34-beyoğlu',
    '34_beyoglu',
    '34 beyoglu',
    '-34',
    '34/beyoglu',
  ])('geçersiz %j → null', (slug) => {
    expect(parsePlaceSlug(slug)).toBeNull()
  })

  it('undefined → null', () => {
    expect(parsePlaceSlug(undefined)).toBeNull()
  })
})
