import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { formatCoordinates, toSelection, type Selection } from './coordinates'
import { TURKEY_BOUNDS, TURKEY_MAX_BOUNDS, TURKEY_ONLY_MESSAGE, isInTurkeyBounds } from './turkey'
import './LocationPicker.css'

// Geliştirme için anahtarsız demo stili. Üretim karo sağlayıcısı açık karar; yalnızca bu sabit değişecek.
export const MAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json'

interface Props {
  value: Selection | null
  onChange: (v: Selection | null) => void
}

type FieldError = { field: 'lat' | 'lng' | 'both' | null; message: string }

const ERROR_ID = 'location-error'

function parseField(text: string, min: number, max: number): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

// Vite worker dosyasını kendiliğinden çıktıya koymaz; adresi açıkça veriyoruz.
let workerUrlSet = false
function ensureWorkerUrl() {
  if (workerUrlSet) return
  workerUrlSet = true
  setWorkerUrl(workerUrl)
}

export function LocationPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<Marker | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onChangeRef = useRef(onChange)
  const [mapError, setMapError] = useState(false)
  const [latText, setLatText] = useState(value ? String(value.latitude) : '')
  const [lngText, setLngText] = useState(value ? String(value.longitude) : '')
  const [fieldError, setFieldError] = useState<FieldError | null>(null)
  const prevHadValue = useRef(value !== null)
  // Giriş hatası yüzünden seçimi kendimiz temizlediğimizde yazılan metin silinmesin
  const skipClear = useRef(false)
  const latTextRef = useRef(latText)
  const lngTextRef = useRef(lngText)
  latTextRef.current = latText
  lngTextRef.current = lngText

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!containerRef.current) return
    let map: MapLibreMap
    try {
      ensureWorkerUrl()
      map = new MapLibreMap({ container: containerRef.current, style: MAP_STYLE_URL,
        bounds: TURKEY_BOUNDS,
        fitBoundsOptions: { padding: 16 },
        maxBounds: TURKEY_MAX_BOUNDS,
      })
      let styleLoaded = false
      map.on('load', () => {
        styleLoaded = true
      })
      // Yalnızca stil yüklenemezse hata göster; tek tek karo hataları sessiz kalır
      map.on('error', () => {
        if (!styleLoaded) setMapError(true)
      })
      map.on('click', (e) => {
        const sel = toSelection(e.lngLat.lat, e.lngLat.lng)
        if (!isInTurkeyBounds(sel.latitude, sel.longitude)) {
          // Alanlar tıklamayla değişmediği için varsa alan hatasını ezme
          setFieldError((prev) => prev ?? { field: null, message: TURKEY_ONLY_MESSAGE })
          return
        }
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
    if (!map) return
    if (!value) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) markerRef.current = new Marker()
    markerRef.current.setLngLat([value.longitude, value.latitude]).addTo(map)
  }, [value])

  // Dışarıdan gelen değeri giriş metinlerine yansıt; metin zaten aynı sayıyı veriyorsa dokunma (yazılanı ezme)
  const lat = value?.latitude
  const lng = value?.longitude
  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      if (prevHadValue.current && !skipClear.current) {
        setLatText('')
        setLngText('')
        setFieldError(null)
      }
      prevHadValue.current = false
      skipClear.current = false
      return
    }
    prevHadValue.current = true
    skipClear.current = false
    const latSame = latTextRef.current.trim() !== '' && Number(latTextRef.current) === lat
    const lngSame = lngTextRef.current.trim() !== '' && Number(lngTextRef.current) === lng
    if (!latSame) setLatText(String(lat))
    if (!lngSame) setLngText(String(lng))
    if (!latSame || !lngSame) setFieldError(null)
  }, [lat, lng])

  function handleField(kind: 'lat' | 'lng', text: string) {
    const nextLat = kind === 'lat' ? text : latText
    const nextLng = kind === 'lng' ? text : lngText
    if (kind === 'lat') setLatText(text)
    else setLngText(text)

    if (nextLat.trim() === '' || nextLng.trim() === '') {
      setFieldError(null)
      return
    }
    const latNum = parseField(nextLat, -90, 90)
    const lngNum = parseField(nextLng, -180, 180)
    const reject = (err: FieldError) => {
      setFieldError(err)
      if (prevHadValue.current) skipClear.current = true
      onChange(null)
    }
    if (latNum === null) {
      reject({ field: 'lat', message: 'Enlem -90 ile 90 arasında bir sayı olmalı.' })
      return
    }
    if (lngNum === null) {
      reject({ field: 'lng', message: 'Boylam -180 ile 180 arasında bir sayı olmalı.' })
      return
    }
    if (!isInTurkeyBounds(latNum, lngNum)) {
      const [[west, south], [east, north]] = TURKEY_BOUNDS
      const latOut = latNum < south || latNum > north
      const lngOut = lngNum < west || lngNum > east
      reject({ field: latOut && lngOut ? 'both' : latOut ? 'lat' : 'lng', message: TURKEY_ONLY_MESSAGE })
      return
    }
    setFieldError(null)
    onChange(toSelection(latNum, lngNum))
  }

  return (
    <div className="location-picker">
      {mapError && (
        <p className="location-error" role="status">
          Harita yüklenemedi. Konumu enlem ve boylam girerek seçebilirsin.
        </p>
      )}
      <div
        ref={containerRef}
        className="location-map"
        role="region"
        aria-label="Türkiye haritası"
        hidden={mapError}
      />
      <div className="location-fields">
        <label>
          Enlem
          <input
            type="number"
            min={-90}
            max={90}
            step="any"
            value={latText}
            aria-invalid={(fieldError?.field === 'lat' || fieldError?.field === 'both') ? 'true' : undefined}
            aria-describedby={(fieldError?.field === 'lat' || fieldError?.field === 'both') ? ERROR_ID : undefined}
            onChange={(e) => handleField('lat', e.target.value)}
          />
        </label>
        <label>
          Boylam
          <input
            type="number"
            min={-180}
            max={180}
            step="any"
            value={lngText}
            aria-invalid={(fieldError?.field === 'lng' || fieldError?.field === 'both') ? 'true' : undefined}
            aria-describedby={(fieldError?.field === 'lng' || fieldError?.field === 'both') ? ERROR_ID : undefined}
            onChange={(e) => handleField('lng', e.target.value)}
          />
        </label>
      </div>
      {fieldError && (
        <p id={ERROR_ID} className="location-error" role="alert">
          {fieldError.message}
        </p>
      )}
      {value && <p className="location-selected">{formatCoordinates(value)}</p>}
    </div>
  )
}
