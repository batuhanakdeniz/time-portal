import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, setWorkerUrl, type MapLayerMouseEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PlaceSelection } from './place'
import { districtSelection, provinceSelection, usePlaces, type DistrictProps, type PlacesData, type ProvinceProps } from './places'
import { TURKEY_BOUNDS, TURKEY_MAX_BOUNDS } from './turkey'
import { ATTRIBUTION, ILCE_ZOOM, turkeyStyle } from './turkeyStyle'
import './TurkeyMap.css'

interface Props {
  selected: PlaceSelection | null
  onSelect(p: PlaceSelection): void
}

type Ref = { source: 'provinces' | 'districts'; id: string }

const EASE_MS = 600

// MapLibre arayüz metinleri (varsayılanları İngilizce)
export const MAP_LOCALE: Record<string, string> = {
  'CooperativeGesturesHandler.WindowsHelpText': 'Haritayı yakınlaştırmak için Ctrl + kaydırma kullan',
  'CooperativeGesturesHandler.MacHelpText': 'Haritayı yakınlaştırmak için ⌘ + kaydırma kullan',
  'CooperativeGesturesHandler.MobileHelpText': 'Haritayı kaydırmak için iki parmak kullan',
  'AttributionControl.ToggleAttribution': 'Atfı göster/gizle',
}

// Vite worker dosyasını kendiliğinden çıktıya koymaz; adresi açıkça veriyoruz (LocationPicker ile aynı kalıp).
let workerUrlSet = false
function ensureWorkerUrl() {
  if (workerUrlSet) return
  workerUrlSet = true
  setWorkerUrl(workerUrl)
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function refsOf(p: PlaceSelection | null): Ref[] {
  if (!p) return []
  const refs: Ref[] = [{ source: 'provinces', id: p.plate }]
  if (p.district) refs.push({ source: 'districts', id: `${p.plate}-${p.district.slug}` })
  return refs
}

/** İl sınırına yakınlaşır; büyük illerde de ilçeler görünsün diye zoom en az ILCE_ZOOM. */
function flyToProvince(map: MapLibreMap, p: ProvinceProps) {
  const cam = map.cameraForBounds(
    [[p.minLng, p.minLat], [p.maxLng, p.maxLat]],
    { padding: 24, maxZoom: 9 },
  )
  if (!cam) return
  map.easeTo({ ...cam, zoom: Math.max(cam.zoom ?? ILCE_ZOOM, ILCE_ZOOM), duration: prefersReducedMotion() ? 0 : EASE_MS })
}

export function TurkeyMap({ selected, onSelect }: Props) {
  const { state, retry } = usePlaces()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onSelectRef = useRef(onSelect)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const data: PlacesData | null = state.data
  const appliedRefs = useRef<Ref[]>([])
  const appliedPlate = useRef<string | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
  })

  // Harita veri hazır olunca bir kez kurulur
  useEffect(() => {
    if (!data || !containerRef.current) return
    setMapError(false) // yeniden denemeden sonra kap gizli kalmasın
    let map: MapLibreMap
    try {
      ensureWorkerUrl()
      map = new MapLibreMap({
        container: containerRef.current,
        style: turkeyStyle(data),
        bounds: TURKEY_BOUNDS,
        fitBoundsOptions: { padding: 16 },
        maxBounds: TURKEY_MAX_BOUNDS,
        // 2B seçim haritası: döndürme/eğme kapalı
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        // Sayfa kaydırmasıyla çakışmasın: mobilde iki parmak, masaüstünde Ctrl/Cmd ile yakınlaştırma
        cooperativeGestures: true,
        attributionControl: { compact: true, customAttribution: ATTRIBUTION },
        locale: MAP_LOCALE,
      })
    } catch {
      setMapError(true)
      return
    }
    map.touchZoomRotate.disableRotation() // iki parmakla yakınlaştırma kalsın, döndürme kapansın
    map.keyboard.disableRotation() // klavyeyle kaydırma/yakınlaştırma kalsın, döndürme/eğme kapansın
    mapRef.current = map

    let loaded = false
    let hovered: Ref | undefined
    const setHover = (ref?: Ref) => {
      if (hovered) map.setFeatureState(hovered, { hover: false })
      hovered = ref
      if (hovered) map.setFeatureState(hovered, { hover: true })
    }

    map.on('error', () => {
      if (!loaded) setMapError(true)
    })
    map.on('load', () => {
      loaded = true
      setReady(true)
    })

    for (const [layer, source] of [['province-fill', 'provinces'], ['district-fill', 'districts']] as const) {
      map.on('mousemove', layer, (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.id
        if (id !== undefined) setHover({ source, id: String(id) })
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, () => {
        setHover(undefined)
        map.getCanvas().style.cursor = ''
      })
    }

    // İl düzeyi: il seçilir (merkez = il merkezi); yakınlaşma seçim senkronunda yapılır
    map.on('click', 'province-fill', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.id
      const p = id === undefined ? undefined : data.provinceByPlate.get(String(id))
      if (!p) return
      // Aynı il yeniden tıklandıysa seçim değişmez; uzaklaşılmış olabileceği için yine yakınlaş
      if (p.plate === appliedPlate.current) flyToProvince(map, p)
      onSelectRef.current(provinceSelection(p))
    })
    // İlçe düzeyi: tıklanan nokta değil ilçe merkezi gönderilir (aynı yer her zaman aynı istek)
    map.on('click', 'district-fill', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.id
      const d: DistrictProps | undefined = id === undefined ? undefined : data.districtByKey.get(String(id))
      if (d) onSelectRef.current(districtSelection(d))
    })

    return () => {
      setReady(false)
      appliedRefs.current = []
      appliedPlate.current = null
      mapRef.current = null
      map.remove()
    }
  }, [data])

  // Dışarıdan gelen seçimi feature-state'e yansıt; il değiştiyse ile yakınlaş
  const selectedKey = selected ? refsOf(selected).map((r) => r.id).join('|') : ''
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !data) return
    for (const r of appliedRefs.current) map.setFeatureState(r, { selected: false })
    const refs = refsOf(selected)
    for (const r of refs) map.setFeatureState(r, { selected: true })
    appliedRefs.current = refs
    const plate = selected?.plate ?? null
    if (plate && plate !== appliedPlate.current) {
      const p = data.provinceByPlate.get(plate)
      if (p) flyToProvince(map, p)
    }
    appliedPlate.current = plate
    // selectedKey seçimin kimliğini taşır; aynı seçimin yeni nesnesi yeniden çalıştırmasın
  }, [ready, data, selectedKey])

  return (
    <div className="turkey-map">
      {state.status === 'loading' && (
        <p className="turkey-map-status" role="status">Harita yükleniyor…</p>
      )}
      {state.status === 'error' && (
        <p className="turkey-map-status turkey-map-error" role="alert">
          Harita verisi yüklenemedi.{' '}
          <button type="button" onClick={retry}>Tekrar dene</button>
        </p>
      )}
      {mapError && (
        <p className="turkey-map-status turkey-map-error" role="status">
          Harita gösterilemiyor. İl ya da ilçeyi aramadan seçebilirsin.
        </p>
      )}
      <div
        ref={containerRef}
        className="turkey-map-canvas"
        role="region"
        aria-label="Türkiye il ve ilçe haritası"
        hidden={mapError}
      />
    </div>
  )
}
