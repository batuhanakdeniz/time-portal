import type { ExpressionSpecification, GeoJSONSourceSpecification, StyleSpecification } from 'maplibre-gl'
import type { DistrictProps, PlaceCollection, PolygonGeometry, ProvinceProps } from './places'

// Altlıksız (karo yok) il/ilçe seçim haritası stili. Temel: docs/arastirma/faz2-arastirma-raporu.md A §3.
// Uygulamanın koyu temasıyla uyumlu renkler (index.css: #0b0d14, vurgu #8ab4ff)
export const COLORS = {
  background: '#0b0d14', // deniz/boşluk = sayfa arka planı
  land: '#2a3046', // seçilmemiş il/ilçe: gri-lacivert
  hover: '#3a4362',
  selected: '#4f74e8', // seçili: açık lacivert
  provinceLine: '#7d86a6',
  districtLine: '#454d6b',
  selectedLine: '#8ab4ff',
  label: '#c9cede',
} as const

export const ILCE_ZOOM = 7 // bu zoom'dan itibaren ilçeler görünür

export const ATTRIBUTION = '© OpenStreetMap katkıcıları, geoBoundaries (ODbL)'

// Seçim/hover kimlikleri: il = plaka kodu, ilçe = "34-beyoglu"
export const PROVINCE_ID = 'plate'
export const DISTRICT_ID = 'key'

// feature-state'e göre dolgu: seçili > üzerinde > varsayılan
const fillByState: ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'selected'], false], COLORS.selected,
  ['boolean', ['feature-state', 'hover'], false], COLORS.hover,
  COLORS.land,
]

// Kendi şema tiplerimiz GeoJSON'un dizin imzalı özellik tipine kendiliğinden atanmıyor
const geojson = (v: object) => v as GeoJSONSourceSpecification['data']

const isSelected: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false]

export interface LabelCollection {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: { name: string }; geometry: { type: 'Point'; coordinates: [number, number] } }[]
}

type Ring = number[][]
const polygonsOf = (g: PolygonGeometry): Ring[][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function inPolygon(x: number, y: number, g: PolygonGeometry): boolean {
  return polygonsOf(g).some((rings) => inRing(x, y, rings[0]) && !rings.slice(1).some((h) => inRing(x, y, h)))
}

/** `y` enleminde poligonun içinde kalan aralıklar: [batı, doğu] çiftleri (delikler dahil, çift-tek kuralı). */
function insideSpans(y: number, g: PolygonGeometry): [number, number][] {
  const spans: [number, number][] = []
  for (const rings of polygonsOf(g)) {
    const xs: number[] = []
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi)
      }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) spans.push([xs[k], xs[k + 1]])
  }
  return spans
}

/**
 * Etiket noktası: il merkezi (province-centers.tsv) poligonun içindeyse kendisi. Değilse (ör. Çanakkale merkezi
 * sadeleştirilmiş kıyının dışında, suya düşüyor) aynı enlemde merkeze en yakın iç aralığın, merkeze bakan ucunun
 * biraz içi; o enlemde
 * kara yoksa sınır kutusunun orta enlemindeki en geniş aralığın ortası.
 */
const LABEL_INSET = 0.05 // derece

export function labelPoint(p: ProvinceProps, g: PolygonGeometry): [number, number] {
  const x = p.centerLon
  const y = p.centerLat
  if (inPolygon(x, y, g)) return [x, y]
  const dist = ([a, b]: [number, number]) => (x < a ? a - x : x > b ? x - b : 0)
  const near = insideSpans(y, g).sort((s, t) => dist(s) - dist(t))[0]
  if (near) {
    // Aralığın merkeze yakın ucundan biraz içeri (en çok ~4 km, dar aralıkta ortası)
    const inset = Math.min(LABEL_INSET, (near[1] - near[0]) / 2)
    return [x < near[0] ? near[0] + inset : near[1] - inset, y]
  }
  const midY = (p.minLat + p.maxLat) / 2
  const wide = insideSpans(midY, g).sort((s, t) => t[1] - t[0] - (s[1] - s[0]))[0]
  return wide ? [(wide[0] + wide[1]) / 2, midY] : [x, y]
}

/** İl adları il merkezine yazılır; merkez il sınırının dışındaysa sınır içindeki yakın bir noktaya. */
export function provinceLabels(provinces: PlaceCollection<ProvinceProps>): LabelCollection {
  return {
    type: 'FeatureCollection',
    features: provinces.features.map(({ properties: p, geometry }) => ({
      type: 'Feature',
      properties: { name: p.name },
      geometry: { type: 'Point', coordinates: labelPoint(p, geometry) },
    })),
  }
}

export function turkeyStyle(data: {
  provinces: PlaceCollection<ProvinceProps>
  districts: PlaceCollection<DistrictProps>
}): StyleSpecification {
  return {
    version: 8,
    // "glyphs" yok: MapLibre ≥5.11 text-font'u yerel yazı tipi listesi sayar, PBF font sunucusu gerekmez
    sources: {
      provinces: { type: 'geojson', data: geojson(data.provinces), promoteId: PROVINCE_ID },
      districts: { type: 'geojson', data: geojson(data.districts), promoteId: DISTRICT_ID },
      'province-labels': { type: 'geojson', data: geojson(provinceLabels(data.provinces)) },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': COLORS.background } },
      { id: 'province-fill', type: 'fill', source: 'provinces', maxzoom: ILCE_ZOOM,
        paint: { 'fill-color': fillByState } },
      { id: 'district-fill', type: 'fill', source: 'districts', minzoom: ILCE_ZOOM,
        paint: { 'fill-color': fillByState } },
      { id: 'district-line', type: 'line', source: 'districts', minzoom: ILCE_ZOOM - 1,
        paint: {
          'line-color': COLORS.districtLine,
          'line-width': 0.6,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], ILCE_ZOOM - 1, 0, ILCE_ZOOM, 1],
        } },
      { id: 'province-line', type: 'line', source: 'provinces',
        paint: {
          'line-color': ['case', isSelected, COLORS.selectedLine, COLORS.provinceLine],
          // zoom ifadesi en dışta olmalı (stil doğrulayıcısı iç içe zoom'u reddediyor)
          'line-width': ['interpolate', ['linear'], ['zoom'],
            5, ['case', isSelected, 2.5, 0.6],
            9, ['case', isSelected, 3, 1.4]],
        } },
      { id: 'district-selected-line', type: 'line', source: 'districts', minzoom: ILCE_ZOOM,
        paint: {
          'line-color': COLORS.selectedLine,
          'line-width': 2,
          'line-opacity': ['case', isSelected, 1, 0],
        } },
      { id: 'province-label', type: 'symbol', source: 'province-labels', maxzoom: ILCE_ZOOM + 1,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['system-ui', 'Helvetica Neue', 'Arial'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 14],
          'text-allow-overlap': false,
        },
        paint: { 'text-color': COLORS.label, 'text-halo-color': COLORS.background, 'text-halo-width': 1.2 } },
    ],
  }
}
