import { describe, expect, it } from 'vitest'
import { formatPlace, placeTitle, providerLabel, safeHttpsUrl, yearNote } from './resultInfo'

describe('formatPlace / placeTitle', () => {
  it('ilçe, il biçimi', () => {
    expect(formatPlace({ province: 'İstanbul', district: 'Beyoğlu' })).toBe('Beyoğlu, İstanbul')
  })
  it('Merkez ilçesi "<İl> Merkez" olur', () => {
    expect(formatPlace({ province: 'Hakkari', district: 'Merkez' })).toBe('Hakkari Merkez')
  })
  it('yer yoksa koordinat gösterilir', () => {
    expect(placeTitle(null, { latitude: 41.9, longitude: 12.5 })).toBe('41.9000° K, 12.5000° D')
    expect(placeTitle(undefined, { latitude: 41.9, longitude: 12.5 })).toBe('41.9000° K, 12.5000° D')
  })
})

describe('yearNote', () => {
  it('2026 için kısa not', () => expect(yearNote(2026)).toBe('2026 görünümü'))
  it('başka yıl için açıklama', () => {
    expect(yearNote(-44)).toBe('Şimdilik 2026 görünümü gösteriliyor. Seçtiğin yıl (MÖ 44) sonraki aşamada gelecek.')
  })
})

describe('safeHttpsUrl', () => {
  it('yalnızca https kabul eder', () => {
    expect(safeHttpsUrl('https://a.example/x')).toBe('https://a.example/x')
    expect(safeHttpsUrl('http://a.example')).toBeNull()
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpsUrl('data:text/html,x')).toBeNull()
    expect(safeHttpsUrl('//a.example')).toBeNull()
    expect(safeHttpsUrl('')).toBeNull()
    expect(safeHttpsUrl(null)).toBeNull()
  })
})

describe('providerLabel', () => {
  it('bilinen sağlayıcılar', () => {
    expect(providerLabel('mapillary')).toEqual({ name: 'Mapillary', url: 'https://www.mapillary.com' })
    expect(providerLabel('wikimedia-commons').name).toBe('Wikimedia Commons')
    expect(providerLabel('sample').name).toBe('Örnek görsel')
    expect(providerLabel('baska')).toEqual({ name: 'baska', url: null })
  })
})
