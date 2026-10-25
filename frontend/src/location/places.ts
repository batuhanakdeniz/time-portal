import { useCallback, useEffect, useState } from 'react'
import { parsePlaceSlug, type PlaceSelection } from './place'

// /geo/*.json veri şeması (docs/FAZ3.md §4; üretim: frontend/tools/build-geo.mjs)
export interface ProvinceProps {
  plate: string
  name: string
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
  centerLat: number
  centerLon: number
}

export interface DistrictProps {
  key: string // "34-beyoglu"; haritada feature-state kimliği (promoteId)
  plate: string
  slug: string
  name: string
  province: string
  lat: number
  lon: number
}

type Position = number[]
export type PolygonGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] }

export interface PlaceFeature<P> {
  type: 'Feature'
  properties: P
  geometry: PolygonGeometry
}

export interface PlaceCollection<P> {
  type: 'FeatureCollection'
  features: PlaceFeature<P>[]
}

export interface PlacesData {
  provinces: PlaceCollection<ProvinceProps>
  districts: PlaceCollection<DistrictProps>
  provinceByPlate: Map<string, ProvinceProps>
  districtByKey: Map<string, DistrictProps>
  districtsByPlate: Map<string, DistrictProps[]>
}

export const PROVINCES_URL = '/geo/provinces.json'
export const DISTRICTS_URL = '/geo/districts.json'

export function provinceSelection(p: ProvinceProps): PlaceSelection {
  return { plate: p.plate, province: p.name, center: { lat: p.centerLat, lon: p.centerLon } }
}

export function districtSelection(d: DistrictProps): PlaceSelection {
  return {
    plate: d.plate,
    province: d.province,
    district: { slug: d.slug, name: d.name, lat: d.lat, lon: d.lon },
    center: { lat: d.lat, lon: d.lon },
  }
}

/** `34` → İstanbul (il merkezi), `34-beyoglu` → Beyoğlu (ilçe merkezi); bilinmeyen/bozuk slug → null. */
export function findBySlug(data: PlacesData, slug: string): PlaceSelection | null {
  const parsed = parsePlaceSlug(slug)
  if (!parsed) return null
  if (parsed.district) {
    const d = data.districtByKey.get(slug)
    return d ? districtSelection(d) : null
  }
  const p = data.provinceByPlate.get(parsed.plate)
  return p ? provinceSelection(p) : null
}

function isCollection(v: unknown): v is PlaceCollection<unknown> {
  return (
    typeof v === 'object' && v !== null &&
    (v as { type?: unknown }).type === 'FeatureCollection' &&
    Array.isArray((v as { features?: unknown }).features)
  )
}

export function indexPlaces(
  provinces: PlaceCollection<ProvinceProps>,
  districts: PlaceCollection<DistrictProps>,
): PlacesData {
  const provinceByPlate = new Map(provinces.features.map((f) => [f.properties.plate, f.properties]))
  const districtByKey = new Map<string, DistrictProps>()
  const districtsByPlate = new Map<string, DistrictProps[]>()
  for (const { properties: d } of districts.features) {
    districtByKey.set(d.key, d)
    const list = districtsByPlate.get(d.plate) ?? []
    list.push(d)
    districtsByPlate.set(d.plate, list)
  }
  for (const list of districtsByPlate.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  return { provinces, districts, provinceByPlate, districtByKey, districtsByPlate }
}

async function fetchCollection(url: string): Promise<PlaceCollection<never>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const body: unknown = await res.json()
  if (!isCollection(body)) throw new Error(`${url}: beklenmeyen biçim`)
  return body as PlaceCollection<never>
}

// Modül düzeyinde tek yükleme: harita ve arama aynı veriyi paylaşır. Hata olursa sonraki çağrı yeniden dener.
let cache: Promise<PlacesData> | null = null

export function loadPlaces(): Promise<PlacesData> {
  if (!cache) {
    cache = Promise.all([fetchCollection(PROVINCES_URL), fetchCollection(DISTRICTS_URL)])
      .then(([p, d]) => indexPlaces(p, d))
      .catch((e: unknown) => {
        cache = null
        throw e
      })
  }
  return cache
}

/** Yalnızca testler için. */
export function resetPlacesCache() {
  cache = null
  resolved = null
}

let resolved: PlacesData | null = null

export type PlacesState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: PlacesData }
  | { status: 'error'; data: null }

export interface UsePlaces {
  state: PlacesState
  findBySlug(slug: string): PlaceSelection | null
  retry(): void
}

export function usePlaces(): UsePlaces {
  // Önceden yüklenmişse ilk çizimde hazır gelir (sayfa geçişlerinde "yükleniyor" yanıp sönmesin)
  const [state, setState] = useState<PlacesState>(() =>
    resolved && cache ? { status: 'ready', data: resolved } : { status: 'loading', data: null },
  )
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    loadPlaces().then(
      (data) => {
        resolved = data
        if (alive) setState({ status: 'ready', data })
      },
      () => {
        if (alive) setState({ status: 'error', data: null })
      },
    )
    return () => {
      alive = false
    }
  }, [attempt])

  const data = state.data
  const find = useCallback((slug: string) => (data ? findBySlug(data, slug) : null), [data])
  const retry = useCallback(() => {
    setState({ status: 'loading', data: null })
    setAttempt((n) => n + 1)
  }, [])
  return { state, findBySlug: find, retry }
}
