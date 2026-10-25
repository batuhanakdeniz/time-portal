import { useCallback, useEffect, useRef, useState } from 'react'
import { Timeline } from './timeline/Timeline'
import { formatYear } from './lib/year'
import { formatCoordinates, type Selection } from './location/coordinates'
import { MapSection } from './location/MapSection'
import { ViewerSection } from './scene/ViewerSection'
import { Attribution } from './scene/Attribution'
import { placeTitle, yearNote } from './scene/resultInfo'
import { apiErrorMessage, failedMessage } from './api/errorMessages'
import { ApiError, createScene, isAbortError, SceneTimeoutError, waitForScene, type SceneResult, type SceneStatus } from './api/scenes'
import './App.css'

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 120_000

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'progress'; status: SceneStatus }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

interface Preview {
  result: SceneResult
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
  if (e instanceof ApiError) return apiErrorMessage(e.status, e.message)
  if (e instanceof SceneTimeoutError) return 'Üretim çok uzun sürdü, lütfen tekrar dene'
  if (e instanceof TypeError) return 'Sunucuya ulaşılamadı'
  return 'Beklenmeyen bir hata oluştu'
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
        setPreview({ result: done.result, year: req.year, location: { latitude: req.latitude, longitude: req.longitude } })
        setPhase({ kind: 'ready' })
      } else if (done.status === 'READY') {
        setPhase({ kind: 'error', message: 'Sunucu geçersiz sonuç döndü' })
      } else {
        setPhase({ kind: 'error', message: failedMessage(done.error) })
      }
    } catch (e) {
      if (isAbortError(e) || signal.aborted) return
      setPhase({ kind: 'error', message: errorMessage(e) })
    }
  }, [location, year])

  const summary = location ? `${formatYear(year)} · ${formatCoordinates(location)}` : `${formatYear(year)} · Haritadan konum seç`
  const result = preview?.result
  const isPhoto = result?.kind === 'photo'
  const title = preview && result ? placeTitle(result.place, preview.location) : ''
  const previewCaption = preview ? `${formatYear(preview.year)}, ${title}` : ''
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
        <MapSection value={location} onChange={setLocation} />
      </section>

      <section className="actions">
        <p className="summary">{summary}</p>
        <button type="button" className="generate" disabled={!location || busy} onClick={() => void generate()}>
          Sahne oluştur
        </button>
        <p className={`status status-${phase.kind}`} role={phase.kind === 'error' ? 'alert' : 'status'}>
          {phaseText(phase)}
          {phase.kind === 'progress' && phase.status === 'RUNNING' && <span className="status-hint"> İlk sahne 30 saniyeyi bulabilir.</span>}
        </p>
      </section>

      {preview && result && (
        <section className="result" aria-label="Sonuç">
          <h2 className="result-title">{title}</h2>
          <p className="result-note">{yearNote(preview.year)}</p>
          <ViewerSection
            src={result.panoramaUrl}
            depthUrl={result.depthUrl}
            kind={result.kind}
            alt={`Üretilen ${isPhoto ? 'fotoğraf' : 'panorama'}: ${previewCaption}`}
          />
          <Attribution attribution={result.attribution} />
        </section>
      )}
    </main>
  )
}
