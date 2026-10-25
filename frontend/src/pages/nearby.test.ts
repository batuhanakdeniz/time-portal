import { describe, expect, it } from 'vitest'
import {
  districtSelection,
  indexPlaces,
  provinceSelection,
  type DistrictProps,
  type PlaceCollection,
  type ProvinceProps,
} from '../location/places'
import { haversineKm, nearestDistricts, SAME_POINT_KM } from './nearby'

const sq = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
const prov = (plate: string, name: string, centerLat: number, centerLon: number): ProvinceProps => ({
  plate, name, minLng: 0, minLat: 0, maxLng: 1, maxLat: 1, centerLat, centerLon,
})
const dist = (plate: string, slug: string, name: string, province: string, lat: number, lon: number): DistrictProps => ({
  key: `${plate}-${slug}`, plate, slug, name, province, lat, lon,
})
const fc = <P,>(props: P[]): PlaceCollection<P> => ({
  type: 'FeatureCollection',
  features: props.map((properties) => ({ type: 'Feature', properties, geometry: sq })),
})

const ISTANBUL = prov('34', 'İstanbul', 41.01, 28.96)
const KOCAELI = prov('41', 'Kocaeli', 40.77, 29.94)
const D = {
  beyoglu: dist('34', 'beyoglu', 'Beyoğlu', 'İstanbul', 41.03194, 28.97611),
  fatih: dist('34', 'fatih', 'Fatih', 'İstanbul', 41.0186, 28.9397),
  sisli: dist('34', 'sisli', 'Şişli', 'İstanbul', 41.0602, 28.9877),
  tuzla: dist('34', 'tuzla', 'Tuzla', 'İstanbul', 40.8161, 29.3006),
  silivri: dist('34', 'silivri', 'Silivri', 'İstanbul', 41.0739, 28.2464),
  gebze: dist('41', 'gebze', 'Gebze', 'Kocaeli', 40.8027, 29.4307),
  // İl merkeziyle (neredeyse) aynı nokta
  merkez: dist('34', 'merkez', 'Merkez', 'İstanbul', 41.0101, 28.9601),
}
const data = indexPlaces(fc([ISTANBUL, KOCAELI]), fc(Object.values(D)))

describe('haversineKm', () => {
  it('İstanbul–Ankara ≈ 350 km; aynı nokta 0', () => {
    expect(haversineKm({ lat: 41.01, lon: 28.96 }, { lat: 39.92, lon: 32.85 })).toBeGreaterThan(340)
    expect(haversineKm({ lat: 41.01, lon: 28.96 }, { lat: 39.92, lon: 32.85 })).toBeLessThan(360)
    expect(haversineKm({ lat: 41, lon: 29 }, { lat: 41, lon: 29 })).toBe(0)
  })
})

describe('nearestDistricts', () => {
  it('seçili ilçe hariç en yakın 3 ilçe, mesafeye göre', () => {
    expect(nearestDistricts(data, districtSelection(D.beyoglu)).map((d) => d.slug)).toEqual(['merkez', 'sisli', 'fatih'])
  })

  it('aynı il öncelikli değil: başka ildeki daha yakın ilçe önce gelir', () => {
    expect(nearestDistricts(data, districtSelection(D.tuzla), 2)[0].key).toBe('41-gebze')
  })

  it('il seçiminde il merkeziyle aynı noktadaki ilçe önerilmez', () => {
    const near = nearestDistricts(data, provinceSelection(ISTANBUL))
    expect(near).toHaveLength(3)
    expect(near.map((d) => d.slug)).not.toContain('merkez')
    for (const d of near) expect(haversineKm({ lat: 41.01, lon: 28.96 }, d)).toBeGreaterThanOrEqual(SAME_POINT_KM)
  })

  it('sayı sınırı ve az veri', () => {
    expect(nearestDistricts(data, districtSelection(D.beyoglu), 1)).toHaveLength(1)
    const tiny = indexPlaces(fc([ISTANBUL]), fc([D.beyoglu]))
    expect(nearestDistricts(tiny, districtSelection(D.beyoglu))).toEqual([])
  })
})
