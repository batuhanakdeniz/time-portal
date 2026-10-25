import { describe, expect, it } from 'vitest'
import { isEntryPoint, mapPath, scenePath } from './paths'

describe('paths', () => {
  it('mapPath', () => {
    expect(mapPath(1453)).toBe('/yil/1453')
    expect(mapPath(-1200)).toBe('/yil/mo-1200')
    expect(mapPath(1453, '34-beyoglu')).toBe('/yil/1453/yer/34-beyoglu')
  })

  it('scenePath', () => {
    expect(scenePath(1453, '34')).toBe('/yil/1453/yer/34/sahne')
    expect(scenePath(-44, '34-beyoglu')).toBe('/yil/mo-44/yer/34-beyoglu/sahne')
  })

  it('isEntryPoint: ilk giriş (key "default") ya da girişte yönlendirilmiş sayfa', () => {
    expect(isEntryPoint({ key: 'default', state: null })).toBe(true)
    expect(isEntryPoint({ key: 'abc123', state: { entry: true } })).toBe(true)
    expect(isEntryPoint({ key: 'abc123', state: null })).toBe(false)
    expect(isEntryPoint({ key: 'abc123', state: { entry: 'evet' } })).toBe(false)
  })
})
