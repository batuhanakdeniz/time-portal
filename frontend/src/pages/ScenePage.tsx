import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Selection } from '../location/coordinates'
import { formatYear } from '../lib/year'
import { ViewerSection } from '../scene/ViewerSection'
import { Attribution } from '../scene/Attribution'
import { placeTitle, yearNote } from '../scene/resultInfo'
import { apiErrorMessage, failedMessage } from '../api/errorMessages'
import { ApiError, createScene, isAbortError, SceneTimeoutError, waitForScene, type SceneResult, type SceneStatus } from '../api/scenes'
import { mapPath } from '../routing/paths'
import { useRouteGuard } from './routeGuard'
import { UNRESOLVED_LINK_MESSAGE, type RouteState } from './routeState'
import { YearBadge } from './YearBadge'

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 120_000

type Phase =
  | { kind: 'submitting' }
  | { kind: 'progress'; status: SceneStatus }
  | { kind: 'ready'; result: SceneResult }
  | { kind: 'error'; message: string }

const progressText: Record<SceneStatus, string> = {
  PENDING: 'Sırada…',
  RUNNING: 'Üretiliyor…',
  READY: 'Sahne hazır',
  FAILED: 'Üretim başarısız',
}

function phaseText(phase: Phase): string {
  switch (phase.kind) {
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

/** `/yil/:yil/yer/:yer/sahne`: sahne. #63 burada `LoadingScreen`, `SceneOverlay`, `SceneError`'u takacak. */
export function ScenePage() {
  const guard = useRouteGuard('scene')
  const navigate = useNavigate()
  if ('redirect' in guard) return guard.redirect
  const { year, placeSlug, state, entry } = guard
  const selection = state.selection

  const back = () => {
    // Derin bağlantıyla gelindiyse geride sitemiz yok: üst rotaya replace, siteden çıkma.
    if (entry) navigate(mapPath(year, placeSlug), { replace: true, state: selection ? ({ selection } satisfies RouteState) : undefined })
    else navigate(-1)
  }

  return (
    <section className="page page-scene" aria-label="Sahne">
      <div className="page-bar">
        <button type="button" className="back" aria-label="Haritaya dön" onClick={back}>
          ←
        </button>
        <YearBadge year={year} />
      </div>
      {selection ? (
        <SceneRun key={`${year}:${selection.latitude}:${selection.longitude}`} year={year} selection={selection} />
      ) : (
        <p className="scene-missing">{UNRESOLVED_LINK_MESSAGE}</p>
      )}
    </section>
  )
}

/** Sayfa açılınca üretimi başlatır; sayfadan çıkınca (geri tuşu dahil) yoklamayı iptal eder. */
function SceneRun({ year, selection }: { year: number; selection: Selection }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'submitting' })
  const controllerRef = useRef<AbortController | null>(null)
  const { latitude, longitude } = selection

  const generate = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const { signal } = controller
    setPhase({ kind: 'submitting' })
    try {
      const created = await createScene({ year, latitude, longitude }, { signal })
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
      if (done.status === 'READY' && done.result) setPhase({ kind: 'ready', result: done.result })
      else if (done.status === 'READY') setPhase({ kind: 'error', message: 'Sunucu geçersiz sonuç döndü' })
      else setPhase({ kind: 'error', message: failedMessage(done.error) })
    } catch (e) {
      if (isAbortError(e) || signal.aborted) return
      setPhase({ kind: 'error', message: errorMessage(e) })
    }
  }, [year, latitude, longitude])

  useEffect(() => {
    void generate()
    return () => controllerRef.current?.abort()
  }, [generate])

  const result = phase.kind === 'ready' ? phase.result : null
  const title = result ? placeTitle(result.place, selection) : ''
  const isPhoto = result?.kind === 'photo'
  return (
    <>
      <div className="actions">
        <p className={`status status-${phase.kind}`} role={phase.kind === 'error' ? 'alert' : 'status'}>
          {phaseText(phase)}
          {phase.kind === 'progress' && phase.status === 'RUNNING' && <span className="status-hint"> İlk sahne 30 saniyeyi bulabilir.</span>}
        </p>
        {phase.kind === 'error' && (
          <button type="button" className="generate" onClick={() => void generate()}>
            Tekrar dene
          </button>
        )}
      </div>

      {result && (
        <section className="result" aria-label="Sonuç">
          <h2 className="result-title">{title}</h2>
          <p className="result-note">{yearNote(year)}</p>
          <ViewerSection
            src={result.panoramaUrl}
            depthUrl={result.depthUrl}
            kind={result.kind}
            alt={`Üretilen ${isPhoto ? 'fotoğraf' : 'panorama'}: ${formatYear(year)}, ${title}`}
          />
          <Attribution attribution={result.attribution} />
        </section>
      )}
    </>
  )
}
