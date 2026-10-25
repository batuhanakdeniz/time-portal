import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { formatYear } from '../lib/year'
import type { PlaceSelection } from '../location/place'
import { usePlaces, type PlacesData } from '../location/places'
import { isAbortError, type SceneResult, type SceneStage } from '../api/scenes'
import { ViewerSection } from '../scene/ViewerSection'
import { SceneOverlay } from '../scene/SceneOverlay'
import { LoadingScreen } from '../scene/LoadingScreen'
import { SceneError, type SceneErrorKind } from '../scene/SceneError'
import { mapPath, scenePath } from '../routing/paths'
import { useRouteGuard } from './routeGuard'
import { INVALID_PLACE_NOTICE, type RouteState } from './routeState'
import { nearestDistricts } from './nearby'
import { errorKind, failedKind, runScene } from './sceneJob'

/** Önbellekteki sahne bu sürede gelirse yükleme ekranı hiç gösterilmez (ekran yanıp sönmez). */
export const LOADER_DELAY_MS = 300
const ELAPSED_TICK_MS = 1000

type Phase =
  | { kind: 'loading'; stage: SceneStage | null }
  /** Sunucu meşgul (503); istemci `until` anında kendiliğinden yeniden dener. */
  | { kind: 'busy'; until: number }
  | { kind: 'ready'; result: SceneResult }
  | { kind: 'error'; error: SceneErrorKind }

/** `/yil/:yil/yer/:yer/sahne`: tam ekran sahne (yükleme → görüntüleyici + katmanlar, ya da hata). */
export function ScenePage() {
  const guard = useRouteGuard('scene')
  if ('redirect' in guard) return guard.redirect
  // Rota tanımı gereği :yer her zaman vardır.
  return <SceneContent year={guard.year} placeSlug={guard.placeSlug ?? ''} entry={guard.entry} />
}

function SceneContent({ year, placeSlug, entry }: { year: number; placeSlug: string; entry: boolean }) {
  const navigate = useNavigate()
  const places = usePlaces()
  const { state, findBySlug } = places
  const selection = useMemo(() => (state.status === 'ready' ? findBySlug(placeSlug) : null), [state.status, findBySlug, placeSlug])

  // "←", "Yer ✎" ve "Vazgeç": haritaya döner, seçim korunur. Derin bağlantıyla (ya da öneriyle) gelindiyse
  // geride bu yerin haritası yoktur: üst rotaya replace, siteden çıkma.
  const toMap = useCallback(() => {
    if (entry) navigate(mapPath(year, placeSlug), { replace: true })
    else navigate(-1)
  }, [entry, navigate, year, placeSlug])

  if (state.status === 'ready' && !selection) {
    return <Navigate to={mapPath(year)} replace state={{ notice: INVALID_PLACE_NOTICE } satisfies RouteState} />
  }
  if (state.status === 'error') {
    return <SceneError kind="network" onRetry={places.retry} onBack={toMap} />
  }
  return (
    <SceneRun
      key={`${year}:${placeSlug}`}
      year={year}
      placeSlug={placeSlug}
      selection={selection}
      data={state.data}
      onBack={toMap}
      onEditYear={() => navigate('/')}
    />
  )
}

interface SceneRunProps {
  year: number
  placeSlug: string
  /** Yer verisi yüklenene kadar null: istek atılmaz, yükleme ekranı sürer. */
  selection: PlaceSelection | null
  data: PlacesData | null
  onBack(): void
  onEditYear(): void
}

/** Yer çözülünce üretimi başlatır; sayfadan çıkınca (geri tuşu, Vazgeç dahil) isteği ve yoklamayı iptal eder. */
function SceneRun({ year, placeSlug, selection, data, onBack, onEditYear }: SceneRunProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', stage: null })
  const [showLoader, setShowLoader] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const startedAt = useRef(Date.now())
  const controllerRef = useRef<AbortController | null>(null)
  const lat = selection?.center.lat
  const lon = selection?.center.lon

  const generate = useCallback(async () => {
    if (lat === undefined || lon === undefined) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const { signal } = controller
    setPhase({ kind: 'loading', stage: null })
    try {
      // İstek tıklanan nokta yerine ilçe (ya da il) merkeziyle gider: aynı yer her zaman aynı istek, önbellek isabeti.
      const done = await runScene(
        { year, latitude: lat, longitude: lon },
        {
          signal,
          onRetryWait: (seconds) => {
            if (signal.aborted) return
            const t = Date.now()
            setNow(t)
            setPhase({ kind: 'busy', until: t + seconds * 1000 })
          },
          onUpdate: (scene) => {
            if (!signal.aborted && scene.status !== 'READY' && scene.status !== 'FAILED') {
              setPhase({ kind: 'loading', stage: scene.stage ?? null })
            }
          },
        },
      )
      if (signal.aborted) return
      if (done.status === 'READY' && done.result) setPhase({ kind: 'ready', result: done.result })
      else if (done.status === 'READY') setPhase({ kind: 'error', error: 'unknown' })
      else setPhase({ kind: 'error', error: failedKind(done.error) })
    } catch (e) {
      if (isAbortError(e) || signal.aborted) return
      setPhase({ kind: 'error', error: errorKind(e) })
    }
  }, [year, lat, lon])

  useEffect(() => {
    // StrictMode etkiyi kur-sök-kur yapar. İstek bir mikro görev sonra gönderilir; o ana dek
    // sökülmüş bir çalıştırma hiç göndermez, böylece backend'de çift iş açılmaz.
    let active = true
    void Promise.resolve().then(() => {
      if (active) void generate()
    })
    return () => {
      active = false
      controllerRef.current?.abort()
    }
  }, [generate])

  // Süre sayacı yüklemede, geri sayım meşgulken ilerler (ikisi de saniyede bir).
  const loading = phase.kind === 'loading' || phase.kind === 'busy'

  // Yükleyici gecikmesi yalnızca ilk açılışta; "Tekrar dene"den sonra hemen gösterilir.
  useEffect(() => {
    const t = setTimeout(() => setShowLoader(true), LOADER_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!loading) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      setElapsedMs(t - startedAt.current)
    }
    tick()
    const id = setInterval(tick, ELAPSED_TICK_MS)
    return () => clearInterval(id)
  }, [loading])

  const retry = () => {
    startedAt.current = Date.now()
    setElapsedMs(0)
    setShowLoader(true)
    void generate()
  }

  const suggestions = useMemo(
    () => (phase.kind === 'error' && phase.error === 'no-image' && data && selection ? nearestDistricts(data, selection) : []),
    [phase, data, selection],
  )

  if (phase.kind === 'busy') {
    // Otomatik yeniden deneme sürüyor: geri sayım; "Tekrar dene" beklemeden hemen dener.
    const retryAfterSec = Math.max(0, Math.ceil((phase.until - now) / 1000))
    return <SceneError kind="busy" retryAfterSec={retryAfterSec} onRetry={retry} onBack={onBack} />
  }

  if (phase.kind === 'error') {
    return (
      <>
        <SceneError kind={phase.error} onRetry={retry} onBack={onBack} />
        {suggestions.length > 0 && (
          <nav className="scene-suggestions" aria-label="Yakındaki ilçeler">
            <p className="scene-suggestions-title">Yakındaki ilçeleri dene</p>
            <ul>
              {suggestions.map((d) => (
                <li key={d.key}>
                  {/* Öneri aynı sayfada yer değişimi: replace; "←" önerilen yerin haritasına gider. */}
                  <Link to={scenePath(year, d.key)} replace state={{ entry: true } satisfies RouteState}>
                    {d.name}, {d.province}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </>
    )
  }

  if (phase.kind === 'loading') {
    if (!showLoader) {
      return (
        <div className="scene-page" aria-busy="true">
          <p className="sr-only" role="status">
            Sahne hazırlanıyor…
          </p>
        </div>
      )
    }
    return <LoadingScreen stage={phase.stage} elapsedMs={elapsedMs} targetYear={year} onCancel={onBack} />
  }

  // READY: seçim yüklenmeden READY olamaz (istek seçimle atılır).
  const place = selection!
  const { result } = phase
  const kind = result.kind === 'photo' ? 'photo' : 'panorama'
  const placeName = place.district ? `${place.district.name}, ${place.province}` : place.province
  // Göreli adres: SceneOverlay aynı kökenle tam URL'ye çevirir (http geliştirme sunucusunda da doğru bağlantı).
  const shareUrl = scenePath(year, placeSlug)
  return (
    <div className="scene-page">
      <div className="scene-stage" data-testid="scene-stage">
        <ViewerSection
          src={result.panoramaUrl}
          depthUrl={result.depthUrl}
          kind={kind}
          alt={`Üretilen ${kind === 'photo' ? 'fotoğraf' : 'panorama'}: ${formatYear(year)}, ${placeName}`}
          showFullscreenButton={false}
        />
      </div>
      <SceneOverlay
        year={year}
        place={{ province: place.province, district: place.district?.name }}
        period={result.period}
        kind={kind}
        attribution={result.attribution}
        onBack={onBack}
        onShare={() => {}}
        onEditYear={onEditYear}
        onEditPlace={onBack}
        shareUrl={shareUrl}
      />
    </div>
  )
}
