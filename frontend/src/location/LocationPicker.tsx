import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { formatCoordinates, toSelection, type Selection } from './coordinates'
import './LocationPicker.css'

// Geliştirme için anahtarsız demo stili. Üretim karo sağlayıcısı açık karar; yalnızca bu sabit değişecek.
export const MAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json'

interface Props {
  value: Selection | null
  onChange: (v: Selection) => void
}

function parseField(text: string, min: number, max: number): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

export function LocationPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<Marker | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onChangeRef = useRef(onChange)
  const [mapError, setMapError] = useState(false)
  const [latText, setLatText] = useState(value ? String(value.latitude) : '')
  const [lngText, setLngText] = useState(value ? String(value.longitude) : '')
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!containerRef.current) return
    let map: MapLibreMap
    try {
      map = new MapLibreMap({ container: containerRef.current, style: MAP_STYLE_URL, center: [0, 20], zoom: 1 })
      map.on('click', (e) => {
        const sel = toSelection(e.lngLat.lat, e.lngLat.lng)
        setLatText(String(sel.latitude))
        setLngText(String(sel.longitude))
        setFieldError(null)
        onChangeRef.current(sel)
      })
    } catch {
      setMapError(true)
      return
    }
    mapRef.current = map
    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  // İşaretçiyi seçili değerle eşle
  useEffect(() => {
    const map = mapRef.current
    if (!map || !value) return
    if (!markerRef.current) markerRef.current = new Marker()
    markerRef.current.setLngLat([value.longitude, value.latitude]).addTo(map)
  }, [value])

  function handleField(kind: 'lat' | 'lng', text: string) {
    const nextLat = kind === 'lat' ? text : latText
    const nextLng = kind === 'lng' ? text : lngText
    if (kind === 'lat') setLatText(text)
    else setLngText(text)

    if (nextLat.trim() === '' || nextLng.trim() === '') {
      setFieldError(null)
      return
    }
    const lat = parseField(nextLat, -90, 90)
    const lng = parseField(nextLng, -180, 180)
    if (lat === null) return setFieldError('Enlem -90 ile 90 arasında bir sayı olmalı.')
    if (lng === null) return setFieldError('Boylam -180 ile 180 arasında bir sayı olmalı.')
    setFieldError(null)
    onChange(toSelection(lat, lng))
  }

  return (
    <div className="location-picker">
      {mapError ? (
        <p className="location-error" role="status">
          Harita yüklenemedi. Konumu enlem ve boylam girerek seçebilirsin.
        </p>
      ) : (
        <div ref={containerRef} className="location-map" aria-label="Dünya haritası" />
      )}
      <div className="location-fields">
        <label>
          Enlem
          <input type="number" step="any" value={latText} onChange={(e) => handleField('lat', e.target.value)} />
        </label>
        <label>
          Boylam
          <input type="number" step="any" value={lngText} onChange={(e) => handleField('lng', e.target.value)} />
        </label>
      </div>
      {fieldError && (
        <p className="location-error" role="alert">
          {fieldError}
        </p>
      )}
      {value && <p className="location-selected">{formatCoordinates(value)}</p>}
    </div>
  )
}
