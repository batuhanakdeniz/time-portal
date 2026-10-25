import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { slugify } from './place'
import {
  DISTRICTS_URL, PROVINCES_URL, findBySlug, indexPlaces, loadPlaces, resetPlacesCache, usePlaces,
  type DistrictProps, type PlaceCollection, type ProvinceProps,
} from './places'

const file = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const readText = (rel: string) => readFileSync(file(rel), 'utf8')

const provincesText = readText('../../public/geo/provinces.json')
const districtsText = readText('../../public/geo/districts.json')
const provinces = JSON.parse(provincesText) as PlaceCollection<ProvinceProps>
const districts = JSON.parse(districtsText) as PlaceCollection<DistrictProps>
const data = indexPlaces(provinces, districts)

// Backend verisi: ilçe adları/merkezleri ve il merkezleri iki tarafta birebir aynı olmalı
const backendDistricts = readText('../../../backend/src/main/resources/geo/districts.txt')
  .split('\n')
  .filter((l) => l.startsWith('D\t'))
  .map((l) => {
    const [, name, province, lat, lon] = l.split('\t')
    return { name, province, lat: Number(lat), lon: Number(lon) }
  })
const backendCenters = readText('../../../backend/src/main/resources/geo/province-centers.tsv')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [name, lat, lon] = l.split('\t')
    return { name, lat: Number(lat), lon: Number(lon) }
  })

describe('geo veri şeması', () => {
  it('81 il, 973 ilçe; geometri Polygon/MultiPolygon', () => {
    expect(provinces.type).toBe('FeatureCollection')
    expect(provinces.features).toHaveLength(81)
    expect(districts.features).toHaveLength(973)
    for (const f of [...provinces.features, ...districts.features]) {
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type)
    }
  })

  it('il özellikleri sözleşmedeki alanlar; plaka 01..81 her biri bir kez', () => {
    for (const { properties: p } of provinces.features) {
      expect(Object.keys(p).sort()).toEqual(
        ['centerLat', 'centerLon', 'maxLat', 'maxLng', 'minLat', 'minLng', 'name', 'plate'].sort(),
      )
      expect(p.minLng).toBeLessThan(p.maxLng)
      expect(p.minLat).toBeLessThan(p.maxLat)
      // il merkezi kendi sınır kutusunun içinde
      expect(p.centerLon).toBeGreaterThanOrEqual(p.minLng)
      expect(p.centerLon).toBeLessThanOrEqual(p.maxLng)
      expect(p.centerLat).toBeGreaterThanOrEqual(p.minLat)
      expect(p.centerLat).toBeLessThanOrEqual(p.maxLat)
    }
    const plates = provinces.features.map((f) => f.properties.plate).sort()
    expect(plates).toEqual(Array.from({ length: 81 }, (_, i) => String(i + 1).padStart(2, '0')))
  })

  it('bilinen plaka kodları (Wikidata hatası düzeltilmiş: Konya 42, Uşak 64)', () => {
    const plateOf = (name: string) => provinces.features.find((f) => f.properties.name === name)?.properties.plate
    expect(plateOf('Adana')).toBe('01')
    expect(plateOf('Ankara')).toBe('06')
    expect(plateOf('İstanbul')).toBe('34')
    expect(plateOf('Konya')).toBe('42')
    expect(plateOf('Rize')).toBe('53')
    expect(plateOf('Tunceli')).toBe('62')
    expect(plateOf('Uşak')).toBe('64')
    expect(plateOf('Düzce')).toBe('81')
  })

  it('ilçe özellikleri sözleşmedeki alanlar (+ key); slug = slugify(ad), il içinde benzersiz', () => {
    const keys = new Set<string>()
    for (const { properties: d } of districts.features) {
      expect(Object.keys(d).sort()).toEqual(['key', 'lat', 'lon', 'name', 'plate', 'province', 'slug'])
      expect(d.slug).toBe(slugify(d.name))
      expect(d.key).toBe(`${d.plate}-${d.slug}`)
      expect(data.provinceByPlate.get(d.plate)?.name).toBe(d.province)
      expect(keys.has(d.key)).toBe(false)
      keys.add(d.key)
    }
    expect(data.districtsByPlate.get('34')).toHaveLength(39)
  })

  it('ilçe adları, illeri ve merkezleri backend districts.txt ile birebir aynı', () => {
    expect(backendDistricts).toHaveLength(973)
    const fmt = (d: { name: string; province: string; lat: number; lon: number }) =>
      `${d.province}/${d.name}/${d.lat}/${d.lon}`
    const front = districts.features.map((f) => fmt(f.properties)).sort()
    const back = backendDistricts.map(fmt).sort()
    expect(front).toEqual(back)
    // ad kümesi (il/ad) ayrıca: bir ad değişirse fark okunur kalsın
    const names = (xs: { name: string; province: string }[]) => xs.map((x) => `${x.province}/${x.name}`).sort()
    expect(names(districts.features.map((f) => f.properties))).toEqual(names(backendDistricts))
  })

  it('il adları ve merkezleri backend province-centers.tsv ile aynı', () => {
    expect(backendCenters).toHaveLength(81)
    const front = provinces.features.map((f) => `${f.properties.name}/${f.properties.centerLat}/${f.properties.centerLon}`).sort()
    expect(front).toEqual(backendCenters.map((c) => `${c.name}/${c.lat}/${c.lon}`).sort())
  })

  it('koordinatlar en çok 3 ondalık; boyut bütçesi (gzip) içinde', () => {
    expect(districtsText).not.toMatch(/\[\d+\.\d{4,},|,\d+\.\d{4,}\]/)
    expect(provincesText).not.toMatch(/\[\d+\.\d{4,},|,\d+\.\d{4,}\]/)
    expect(gzipSync(districtsText).length).toBeLessThanOrEqual(250 * 1024)
    expect(gzipSync(provincesText).length).toBeLessThanOrEqual(120 * 1024)
  })
})

describe('findBySlug', () => {
  it('il slug → il merkezi, ilçe yok', () => {
    expect(findBySlug(data, '34')).toEqual({
      plate: '34', province: 'İstanbul', center: { lat: 41.01, lon: 28.96028 },
    })
  })

  it('ilçe slug → ilçe merkezi', () => {
    const p = findBySlug(data, '34-beyoglu')
    expect(p?.province).toBe('İstanbul')
    expect(p?.district).toEqual({ slug: 'beyoglu', name: 'Beyoğlu', lat: p?.center.lat, lon: p?.center.lon })
    const d = districts.features.find((f) => f.properties.key === '34-beyoglu')!.properties
    expect(p?.center).toEqual({ lat: d.lat, lon: d.lon })
  })

  it('bilinmeyen ya da bozuk slug null', () => {
    for (const s of ['00', '82', '34-yok', '06-beyoglu', 'istanbul', '']) expect(findBySlug(data, s)).toBeNull()
  })
})

describe('loadPlaces / usePlaces', () => {
  const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
  const fixture = {
    [PROVINCES_URL]: { type: 'FeatureCollection', features: provinces.features.slice(0, 2) },
    [DISTRICTS_URL]: { type: 'FeatureCollection', features: districts.features.slice(0, 3) },
  }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetPlacesCache()
    fetchMock = vi.fn(async (url: string) => okResponse(fixture[url as keyof typeof fixture]))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    resetPlacesCache()
  })

  it('iki dosyayı bir kez indirir, sonraki çağrılar önbellekten', async () => {
    const a = await loadPlaces()
    const b = await loadPlaces()
    expect(a).toBe(b)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([DISTRICTS_URL, PROVINCES_URL].sort())
    expect(a.provinceByPlate.size).toBe(2)
  })

  it('hata sonrası önbellek temizlenir, yeniden denenir', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    await expect(loadPlaces()).rejects.toThrow('HTTP 500')
    await expect(loadPlaces()).resolves.toBeTruthy()
  })

  it('beklenmeyen biçim hata sayılır', async () => {
    fetchMock.mockImplementation(async () => okResponse({ hello: 1 }))
    await expect(loadPlaces()).rejects.toThrow('beklenmeyen biçim')
  })

  it('usePlaces: yükleniyor → hazır; findBySlug çalışır', async () => {
    const { result } = renderHook(() => usePlaces())
    expect(result.current.state.status).toBe('loading')
    expect(result.current.findBySlug('01')).toBeNull()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(result.current.findBySlug('01')?.province).toBe('Adana')
  })

  it('usePlaces: hata → retry ile yeniden yükler', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response)
    const { result } = renderHook(() => usePlaces())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    fetchMock.mockImplementation(async (url: string) => okResponse(fixture[url as keyof typeof fixture]))
    act(() => result.current.retry())
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
  })
})
