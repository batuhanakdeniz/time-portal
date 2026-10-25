import { describe, expect, it } from 'vitest'
import { formatPlace, providerLabel, safeHttpsUrl } from './resultInfo'

describe('formatPlace', () => {
  it('ilçe, il biçimi', () => {
    expect(formatPlace({ province: 'İstanbul', district: 'Beyoğlu' })).toBe('Beyoğlu, İstanbul')
  })
  it('Merkez ilçesi "<İl> Merkez" olur', () => {
    expect(formatPlace({ province: 'Hakkari', district: 'Merkez' })).toBe('Hakkari Merkez')
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
    expect(safeHttpsUrl('https:javascript:alert(1)')).toBeNull()
    expect(safeHttpsUrl('java\nscript:alert(1)')).toBeNull()
    expect(safeHttpsUrl('\tjavascript:alert(1)')).toBeNull()
    expect(safeHttpsUrl('  javascript:alert(1)')).toBeNull()
    expect(safeHttpsUrl(null)).toBeNull()
  })
})

describe('safeHttpsUrl normalizasyonu', () => {
  it('normalize edilmiş href döner', () => {
    expect(safeHttpsUrl('HTTPS://A.Example/x')).toBe('https://a.example/x')
    expect(safeHttpsUrl('  \thttps://a.example/x')).toBe('https://a.example/x')
    expect(safeHttpsUrl('https://a.example')).toBe('https://a.example/')
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
