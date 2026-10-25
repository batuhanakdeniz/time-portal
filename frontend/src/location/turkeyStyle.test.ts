// Stil doğrulayıcısı maplibre-gl'nin kendi bağımlılığı (ayrı npm paketi eklenmedi)
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { describe, expect, it } from 'vitest'
import type { DistrictProps, PlaceCollection, ProvinceProps } from './places'
import { ATTRIBUTION, COLORS, ILCE_ZOOM, provinceLabels, turkeyStyle } from './turkeyStyle'

const square = (x: number, y: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]],
})

const provinces: PlaceCollection<ProvinceProps> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { plate: '06', name: 'Ankara', minLng: 31, minLat: 39, maxLng: 34, maxLat: 41, centerLat: 39.93, centerLon: 32.86 },
    geometry: square(32, 39),
  }],
}
const districts: PlaceCollection<DistrictProps> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { key: '06-cankaya', plate: '06', slug: 'cankaya', name: 'Çankaya', province: 'Ankara', lat: 39.9, lon: 32.86 },
    geometry: square(32.5, 39.5),
  }],
}

const style = turkeyStyle({ provinces, districts })
const layer = (id: string) => style.layers.find((l) => l.id === id) as unknown as {
  minzoom?: number; maxzoom?: number; paint: Record<string, unknown>; layout?: Record<string, unknown>
}

describe('turkeyStyle', () => {
  it('MapLibre stil doğrulayıcısından hatasız geçer', () => {
    expect(validateStyleMin(style)).toEqual([])
  })

  it('karo altlığı ve font sunucusu yok: yalnızca yerel GeoJSON kaynakları', () => {
    expect(style.glyphs).toBeUndefined()
    expect(style.sprite).toBeUndefined()
    for (const src of Object.values(style.sources)) expect(src.type).toBe('geojson')
    expect(style.sources.provinces).toMatchObject({ promoteId: 'plate' })
    expect(style.sources.districts).toMatchObject({ promoteId: 'key' })
  })

  it('koyu zemin, gri dolgu, hover ve seçili renkleri feature-state ile', () => {
    expect(layer('bg').paint['background-color']).toBe('#0b0d14')
    const fill = JSON.stringify(layer('province-fill').paint['fill-color'])
    expect(fill).toContain('"feature-state","selected"')
    expect(fill).toContain('"feature-state","hover"')
    expect(fill).toContain(COLORS.selected)
    expect(COLORS.selected).toBe('#4f74e8')
    expect(JSON.stringify(layer('province-line').paint['line-color'])).toContain('#8ab4ff')
  })

  it(`iller ${ILCE_ZOOM} altında, ilçeler ${ILCE_ZOOM} ve üstünde`, () => {
    expect(ILCE_ZOOM).toBe(7)
    expect(layer('province-fill').maxzoom).toBe(ILCE_ZOOM)
    expect(layer('district-fill').minzoom).toBe(ILCE_ZOOM)
  })

  it('il adları yerel yazı tipiyle, il merkezine', () => {
    expect(layer('province-label').layout?.['text-font']).toEqual(['system-ui', 'Helvetica Neue', 'Arial'])
    expect(provinceLabels(provinces).features[0]).toEqual({
      type: 'Feature', properties: { name: 'Ankara' }, geometry: { type: 'Point', coordinates: [32.86, 39.93] },
    })
  })

  it('ODbL atfı Türkçe', () => {
    expect(ATTRIBUTION).toBe('© OpenStreetMap katkıcıları, geoBoundaries (ODbL)')
  })
})
