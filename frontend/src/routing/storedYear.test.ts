import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStoredYear, STORED_YEAR_KEY, writeStoredYear } from './storedYear'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('storedYear', () => {
  it('anahtar tp.year', () => {
    expect(STORED_YEAR_KEY).toBe('tp.year')
  })

  it('yazılan yılı geri okur', () => {
    writeStoredYear(-1200)
    expect(localStorage.getItem('tp.year')).toBe('-1200')
    expect(readStoredYear()).toBe(-1200)
  })

  it('kayıt yoksa null', () => {
    expect(readStoredYear()).toBeNull()
  })

  it.each(['0', 'abc', '1.5', '100001', '', ' 1453'])('bozuk kayıt (%j) → null', (raw) => {
    localStorage.setItem('tp.year', raw)
    expect(readStoredYear()).toBeNull()
  })

  it('okuma hata verirse (gizli pencere) null döner, fırlatmaz', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readStoredYear()).toBeNull()
  })

  it('yazma hata verirse (kota) sessizce geçer', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => writeStoredYear(1453)).not.toThrow()
  })

  it('geçersiz yıl yazılmaz', () => {
    writeStoredYear(0)
    expect(localStorage.getItem('tp.year')).toBeNull()
  })
})
