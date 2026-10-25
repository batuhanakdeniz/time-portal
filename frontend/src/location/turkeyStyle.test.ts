import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { DistrictProps, PlaceCollection, ProvinceProps } from './places'
import { ATTRIBUTION, COLORS, ILCE_ZOOM, inPolygon, labelPoint, provinceLabels, turkeyStyle } from './turkeyStyle'

// Değişkenle: Vite, düz metinli `new URL('…', import.meta.url)` kalıbını varlık adresine çeviriyor
const realRel = '../../public/geo/provinces.json'
const realFile = fileURLToPath(new URL(realRel, import.meta.url))
const real = JSON.parse(readFileSync(realFile, 'utf8')) as PlaceCollection<ProvinceProps>

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
  // Not: maplibre-gl kendi paketinden stil doğrulayıcısı dışa aktarmıyor; geçişli bağımlılığı
  // (@maplibre/maplibre-gl-style-spec) doğrudan içe aktarmamak için doğrulama yapısal kontrollerle yapılır.
  it('katman kimlikleri, tipleri ve kaynakları', () => {
    expect(style.version).toBe(8)
    expect(style.layers.map((l) => [l.id, l.type])).toEqual([
      ['bg', 'background'],
      ['province-fill', 'fill'],
      ['district-fill', 'fill'],
      ['district-line', 'line'],
      ['province-line', 'line'],
      ['district-selected-line', 'line'],
      ['province-label', 'symbol'],
    ])
    for (const l of style.layers) {
      if ('source' in l) expect(Object.keys(style.sources)).toContain(l.source)
    }
  })

  it('feature-state yalnızca paint içinde; zoom ifadesi en dışta', () => {
    for (const l of style.layers) {
      const { paint: _p, ...rest } = l as unknown as Record<string, unknown>
      expect(JSON.stringify(rest)).not.toContain('feature-state')
    }
    // zoom içeren her paint değeri ya düz ['interpolate', _, ['zoom'], ...] ya da zoom'suz olmalı
    for (const l of style.layers) {
      for (const v of Object.values((l as { paint?: Record<string, unknown> }).paint ?? {})) {
        const text = JSON.stringify(v)
        if (!text.includes('["zoom"]')) continue
        const expr = v as unknown[]
        expect(expr[0]).toBe('interpolate')
        expect(expr[2]).toEqual(['zoom'])
        expect(JSON.stringify(expr.slice(3))).not.toContain('["zoom"]')
      }
    }
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

describe('labelPoint', () => {
  const p = provinces.features[0].properties // kare: 32–33 boylam, 39–40 enlem

  it('merkez poligon içindeyse kendisi', () => {
    expect(labelPoint({ ...p, centerLon: 32.5, centerLat: 39.5 }, square(32, 39))).toEqual([32.5, 39.5])
  })

  it('merkez dışarıdaysa aynı enlemde en yakın iç aralığın merkeze bakan ucunun biraz içi', () => {
    const [x, y] = labelPoint({ ...p, centerLon: 31.2, centerLat: 39.25 }, square(32, 39))
    expect(x).toBeCloseTo(32.05)
    expect(y).toBe(39.25)
    expect(labelPoint({ ...p, centerLon: 34, centerLat: 39.25 }, square(32, 39))[0]).toBeCloseTo(32.95)
    // dar aralıkta ortası
    const narrow = { type: 'Polygon' as const, coordinates: [[[32, 39], [32.04, 39], [32.04, 40], [32, 40], [32, 39]]] }
    expect(labelPoint({ ...p, centerLon: 31, centerLat: 39.5 }, narrow)[0]).toBeCloseTo(32.02)
    expect(inPolygon(x, y, square(32, 39))).toBe(true)
  })

  it('o enlemde kara yoksa sınır kutusunun orta enlemi', () => {
    const q = { ...p, minLat: 39, maxLat: 40, centerLon: 32.5, centerLat: 41 }
    expect(labelPoint(q, square(32, 39))).toEqual([32.5, 39.5])
  })

  it('gerçek veri: 81 il etiketinin hepsi kendi il sınırı içinde; Çanakkale kıyıya taşınır', () => {
    const labels = provinceLabels(real)
    real.features.forEach((f, i) => {
      const [x, y] = labels.features[i].geometry.coordinates
      expect(inPolygon(x, y, f.geometry), f.properties.name).toBe(true)
    })
    const i = real.features.findIndex((f) => f.properties.name === 'Çanakkale')
    const c = real.features[i].properties
    const [x, y] = labels.features[i].geometry.coordinates
    expect(y).toBe(c.centerLat)
    expect(Math.abs(x - c.centerLon)).toBeLessThan(0.1)
    // merkezi içeride olan iller yerinde kalır
    const ist = real.features.findIndex((f) => f.properties.plate === '34')
    expect(labels.features[ist].geometry.coordinates).toEqual([real.features[ist].properties.centerLon, real.features[ist].properties.centerLat])
  })
})
