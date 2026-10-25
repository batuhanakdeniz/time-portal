import { useEffect, useState, type CSSProperties } from 'react'
import type { SceneStage } from '../api/scenes'
import { formatYear } from '../lib/year'
import './LoadingScreen.css'

export interface LoadingScreenProps {
  /** Sunucunun bildirdiği aşama; null ise sahte aşama gösterilmez, yalnızca geçen süre. */
  stage: SceneStage | null
  /** İşin başlangıcından beri geçen süre (sayfa günceller). */
  elapsedMs: number
  targetYear: number
  onCancel(): void
}

export const COUNTER_FROM = 2026
export const COUNTER_MS = 1500
/** Bu süreden sonra halkalar durgun "nefes" moduna geçer (WCAG 2.2.2). */
export const CALM_AFTER_MS = 5000
/** Bu süreyi aşınca "Beklenenden uzun sürüyor" gösterilir. */
export const LONG_WAIT_MS = 35000
const TYPICAL_WAIT = 'genelde 10–35 sn'

export const STAGE_STEPS: readonly { stage: SceneStage; label: string }[] = [
  { stage: 'LOCATING', label: 'İlçe bulunuyor' },
  { stage: 'IMAGE_SEARCH', label: 'Görsel aranıyor (360° → fotoğraf)' },
  { stage: 'DEPTH', label: 'Derinlik hesaplanıyor' },
  { stage: 'PACKAGING', label: 'Sahne kuruluyor' },
]

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(REDUCED_MOTION)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/** Sayaç değeri: from → to, t ∈ [0, 1], ease-out. Yıl 0 yoktur; geçişte atlanır. */
export function counterYear(from: number, to: number, t: number): number {
  const k = easeOutCubic(Math.min(1, Math.max(0, t)))
  const v = Math.round(from + (to - from) * k)
  return v === 0 ? (to < 0 ? -1 : 1) : v
}

/** formatYear'ın kabul ettiği yıl: tamsayı ve 0 değil. */
export function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year !== 0
}

function useCountdownYear(target: number, reduced: boolean): number {
  const [shown, setShown] = useState(() => (reduced ? target : COUNTER_FROM))
  useEffect(() => {
    if (!isValidYear(target)) return
    if (reduced) {
      setShown(target)
      return
    }
    let start: number | null = null
    let raf = 0
    const frame = (now: number) => {
      if (start === null) start = now
      const t = (now - start) / COUNTER_MS
      setShown(counterYear(COUNTER_FROM, target, t))
      if (t < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced])
  return shown
}

/** Sahne üretilirken tam ekran yükleme durumu: CSS halkaları, yıl sayacı, aşamalar ve süre. */
export function LoadingScreen({ stage, elapsedMs, targetYear, onCancel }: LoadingScreenProps) {
  const reduced = useReducedMotion()
  const shown = useCountdownYear(targetYear, reduced)
  // Geçersiz hedef yılda (0, NaN, kesirli) sayaç ve yol satırı gizlenir; ekran yine çalışır.
  const validTarget = isValidYear(targetYear)
  const [calmTimer, setCalmTimer] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setCalmTimer(true), CALM_AFTER_MS)
    return () => clearTimeout(id)
  }, [])

  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  const calm = calmTimer || elapsed >= CALM_AFTER_MS
  const motion = reduced ? 'reduced' : calm ? 'calm' : 'active'
  const current = stage ? STAGE_STEPS.findIndex((s) => s.stage === stage) : -1
  const progress = Math.min(1, elapsed / LONG_WAIT_MS)

  return (
    <section className="loading-screen" data-motion={motion} aria-label="Sahne hazırlanıyor">
      <div className="loading-rings" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="loading-ring" style={{ '--i': i } as CSSProperties} />
        ))}
        {validTarget && isValidYear(shown) && <span className="loading-counter">{formatYear(shown)}</span>}
      </div>
      {validTarget && (
        <p className="loading-route">
          {formatYear(COUNTER_FROM)} → {formatYear(targetYear)}
        </p>
      )}

      <div className="loading-status" role="status">
        <p className="loading-title">Zamanda yolculuk sürüyor…</p>
        {current >= 0 && (
          <ol className="loading-steps">
            {STAGE_STEPS.map((s, i) => (
              <li
                key={s.stage}
                data-state={i < current ? 'done' : i === current ? 'current' : 'todo'}
                aria-current={i === current ? 'step' : undefined}
              >
                {s.label}
              </li>
            ))}
          </ol>
        )}
        {elapsed > LONG_WAIT_MS && <p className="loading-long">Beklenenden uzun sürüyor</p>}
      </div>

      <p className="loading-elapsed">
        {Math.floor(elapsed / 1000)} sn · {TYPICAL_WAIT}
      </p>
      <div className="loading-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      <button type="button" className="loading-cancel" onClick={onCancel}>
        Vazgeç
      </button>
    </section>
  )
}
