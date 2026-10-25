import type { ExpressionSpecification, GeoJSONSourceSpecification, StyleSpecification } from 'maplibre-gl'
import type { DistrictProps, PlaceCollection, ProvinceProps } from './places'

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

/** İl adları il merkezine (province-centers.tsv) yazılır. */
export function provinceLabels(provinces: PlaceCollection<ProvinceProps>): LabelCollection {
  return {
    type: 'FeatureCollection',
    features: provinces.features.map(({ properties: p }) => ({
      type: 'Feature',
      properties: { name: p.name },
      geometry: { type: 'Point', coordinates: [p.centerLon, p.centerLat] },
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
