import { describe, expect, it } from 'vitest'
import { parsePlaceSlug, placeToSlug, slugify, type PlaceSelection } from './place'

describe('slugify', () => {
  it.each([
    ['Beyoğlu', 'beyoglu'],
    ['Merkez', 'merkez'],
    ['Şebinkarahisar', 'sebinkarahisar'],
    ['İnebolu', 'inebolu'],
    ['Iğdır', 'igdir'],
    ['Çağlayancerit', 'caglayancerit'],
    ['Gölbaşı', 'golbasi'],
    ['Ünye', 'unye'],
    ['ÖZALP', 'ozalp'],
    ['Hakkâri', 'hakkari'],
    ['Kahta (Adıyaman)', 'kahta-adiyaman'],
    ['  Eski  Şehir. ', 'eski-sehir'],
  ])('%s → %s', (input, out) => {
    expect(slugify(input)).toBe(out)
  })

  it('çıktı yalnızca ASCII küçük harf, rakam ve tire', () => {
    expect(slugify('Ağrı Dağı / Doğubayazıt')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})

describe('placeToSlug / parsePlaceSlug', () => {
  const ist: PlaceSelection = { plate: '34', province: 'İstanbul', center: { lat: 41.01, lon: 28.96 } }
  const beyoglu: PlaceSelection = {
    ...ist,
    district: { slug: 'beyoglu', name: 'Beyoğlu', lat: 41.03, lon: 28.97 },
    center: { lat: 41.03, lon: 28.97 },
  }

  it('yalnızca il → plaka, ilçe → plaka-slug', () => {
    expect(placeToSlug(ist)).toBe('34')
    expect(placeToSlug(beyoglu)).toBe('34-beyoglu')
  })

  it('geçerli slug ayrıştırılır', () => {
    expect(parsePlaceSlug('34')).toEqual({ plate: '34' })
    expect(parsePlaceSlug('34-beyoglu')).toEqual({ plate: '34', district: 'beyoglu' })
    expect(parsePlaceSlug('28-sebinkarahisar')).toEqual({ plate: '28', district: 'sebinkarahisar' })
    expect(parsePlaceSlug('01-kahta-adiyaman')).toEqual({ plate: '01', district: 'kahta-adiyaman' })
  })

  it('bozuk slug null', () => {
    for (const s of ['', '3', '345', 'ist', '34-', '34-Beyoglu', '34--x', '34-beyoğlu', '34/beyoglu']) {
      expect(parsePlaceSlug(s)).toBeNull()
    }
  })
})
