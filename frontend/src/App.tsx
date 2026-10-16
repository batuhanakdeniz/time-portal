import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Timeline } from './timeline/Timeline'
import { formatYear } from './lib/year'
import { formatCoordinates, type Selection } from './location/coordinates'
import { ScenePreview } from './scene/ScenePreview'
import { ApiError, createScene, isAbortError, SceneTimeoutError, waitForScene, type SceneStatus } from './api/scenes'
import './App.css'

// maplibre-gl büyük olduğu için harita ayrı parçada yüklenir.
const LocationPicker = lazy(() => import('./location/LocationPicker').then((m) => ({ default: m.LocationPicker })))

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 120_000

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'progress'; status: SceneStatus }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

interface Preview {
  src: string
  year: number
  location: Selection
}

const progressText: Record<SceneStatus, string> = {
  PENDING: 'Sırada…',
  RUNNING: 'Üretiliyor…',
  READY: 'Sahne hazır',
  FAILED: 'Üretim başarısız',
}

function phaseText(phase: Phase): string {
  switch (phase.kind) {
    case 'idle':
      return ''
    case 'submitting':
      return 'Gönderiliyor…'
    case 'progress':
      return progressText[phase.status]
    case 'ready':
      return progressText.READY
    case 'error':
      return phase.message
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof SceneTimeoutError) return 'Üretim çok uzun sürdü, lütfen tekrar dene'
  return 'Sunucuya ulaşılamadı'
}

export default function App() {
  const [year, setYear] = useState(2026)
  const [location, setLocation] = useState<Selection | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [preview, setPreview] = useState<Preview | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const busy = phase.kind === 'submitting' || phase.kind === 'progress'

  const generate = useCallback(async () => {
    if (!location) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const { signal } = controller
    const req = { year, latitude: location.latitude, longitude: location.longitude }

    setPreview(null)
    setPhase({ kind: 'submitting' })
    try {
      const created = await createScene(req, { signal })
      if (signal.aborted) return
      setPhase({ kind: 'progress', status: created.status })
      const done = await waitForScene(created.id, {
        intervalMs: POLL_INTERVAL_MS,
        timeoutMs: POLL_TIMEOUT_MS,
        signal,
        onStatus: (status) => {
          if (!signal.aborted && status !== 'READY' && status !== 'FAILED') setPhase({ kind: 'progress', status })
        },
      })
      if (signal.aborted) return
      if (done.status === 'READY' && done.result) {
        setPreview({ src: done.result.panoramaUrl, year: req.year, location: { latitude: req.latitude, longitude: req.longitude } })
        setPhase({ kind: 'ready' })
      } else {
        setPhase({ kind: 'error', message: `Üretim başarısız: ${done.error ?? 'bilinmeyen hata'}` })
      }
    } catch (e) {
      if (isAbortError(e) || signal.aborted) return
      setPhase({ kind: 'error', message: errorMessage(e) })
    }
  }, [location, year])

  const summary = location ? `${formatYear(year)} · ${formatCoordinates(location)}` : `${formatYear(year)} · Haritadan konum seç`
  const previewCaption = preview ? `${formatYear(preview.year)}, ${formatCoordinates(preview.location)}` : ''
  return (
    <main className="app">
      <header>
        <h1>Time Portal</h1>
        <p>Bir tarih ve konum seç, o anı 3 boyutlu keşfet.</p>
      </header>

      <section className="panel" aria-label="Zaman">
        <Timeline value={year} onChange={setYear} />
      </section>

      <section className="panel" aria-label="Konum">
        <Suspense fallback={<p className="map-loading">Harita yükleniyor…</p>}>
          <LocationPicker value={location} onChange={setLocation} />
        </Suspense>
      </section>

      <section className="actions">
        <p className="summary">{summary}</p>
        <button type="button" className="generate" disabled={!location || busy} onClick={() => void generate()}>
          Sahne oluştur
        </button>
        <p className={`status status-${phase.kind}`} role="status">
          {phaseText(phase)}
        </p>
      </section>

      {preview && (
        <section className="result">
          <ScenePreview src={preview.src} caption={`Üretilen panorama: ${previewCaption}`} />
        </section>
      )}
    </main>
  )
}
