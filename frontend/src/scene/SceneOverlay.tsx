import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { SceneAttribution, ScenePeriod } from '../api/scenes'
import { formatYear } from '../lib/year'
import { Attribution } from './Attribution'
import { formatPlace, providerLabel } from './resultInfo'
import './SceneOverlay.css'

export interface SceneOverlayPlace {
  province: string
  district?: string | null
}

export interface SceneOverlayProps {
  year: number
  place: SceneOverlayPlace
  period?: ScenePeriod | null
  kind: 'panorama' | 'photo'
  attribution?: SceneAttribution | null
  /** "←": haritaya dön. */
  onBack(): void
  /** Paylaş düğmesine basıldığında çağrılır; paylaşımı (Web Share ya da kopyalama) bileşen yapar. */
  onShare(): void
  /** Yoksa "Yıl ✎" onBack'i çağırır. */
  onEditYear?(): void
  /** Yoksa "Yer ✎" onBack'i çağırır. */
  onEditPlace?(): void
  /** Paylaşılacak bağlantı; yoksa geçerli sayfa adresi. */
  shareUrl?: string
}

/** Jest ipucunun ilk açılışta görünme süresi. */
export const HINT_MS = 3000
/** Bu kadar hareketsizlikten sonra katmanlar soluklaşır. */
export const IDLE_MS = 4000
/** Dokunuş sayılması için en fazla kayma (px) ve süre (ms); daha fazlası sürüklemedir. */
export const TAP_MAX_MOVE = 10
export const TAP_MAX_MS = 500
const COPIED_MS = 3000
const PRESENT_YEAR = 2026

/** "Beyoğlu, İstanbul"; ilçe yoksa yalnızca il. */
export function overlayPlaceTitle(place: SceneOverlayPlace): string {
  return place.district ? formatPlace({ province: place.province, district: place.district }) : place.province
}

/** Alt çubuktaki kısa yer adı: "Beyoğlu", "Hakkari Merkez" ya da il. */
export function overlayPlaceShort(place: SceneOverlayPlace): string {
  if (!place.district) return place.province
  return place.district === 'Merkez' ? `${place.province} Merkez` : place.district
}

/**
 * Yıl ve dönem notu (docs/FAZ3.md §2, MVP): `yorum` dönemde "Şimdilik 2026 görünümü; <Dönem> sahnesi hazırlanıyor",
 * diğerlerinde "2026 görünümü"; seçilen yıl 2026 değilse başına "<yıl> seçildi" eklenir.
 */
export function sceneYearNote(year: number, period?: ScenePeriod | null): string {
  const view =
    period?.confidence === 'yorum' ? `Şimdilik 2026 görünümü; ${period.name} sahnesi hazırlanıyor` : '2026 görünümü'
  return year === PRESENT_YEAR ? view : `${formatYear(year)} seçildi · ${view}`
}

/** Her zaman görünen tek satırlık atıf. */
export function attributionLine(attribution?: SceneAttribution | null): string {
  if (!attribution) return 'Harita verisi © OpenStreetMap katkıcıları'
  const parts = [attribution.author, attribution.license, providerLabel(attribution.provider).name].filter(Boolean)
  return `Görsel: ${parts.join(' · ')}`
}

/**
 * Paylaşılacak bağlantı: yalnızca https: ya da aynı kökenli göreli adres (mutlak hale getirilir);
 * geçersiz ya da yoksa geçerli sayfa adresi.
 */
export function safeShareUrl(shareUrl: string | null | undefined, base: string = window.location.href): string {
  if (!shareUrl) return base
  try {
    const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(shareUrl) && !shareUrl.startsWith('//')
    const u = new URL(shareUrl, base)
    if (isRelative) return u.origin === new URL(base).origin ? u.href : base
    return u.protocol === 'https:' && u.hostname !== '' ? u.href : base
  } catch {
    return base
  }
}

export const NOTE_CHIP = 'Yapay zekâ yorumu değil: 2026 fotoğrafı + derinlik'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(REDUCED_MOTION)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void }

/** PanoramaViewer'daki kontrolün aynısı: iPhone Safari öğe tam ekranını desteklemez. */
function fullscreenSupported(): boolean {
  const el = document.documentElement as FullscreenEl
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'
}

function currentFullscreenElement(): Element | null {
  const d = document as FullscreenDoc
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

async function toggleFullscreen() {
  try {
    const d = document as FullscreenDoc
    if (currentFullscreenElement()) {
      await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.())
    } else {
      const el = document.documentElement as FullscreenEl
      await (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.())
    }
  } catch {
    // Tarayıcı reddederse görünüm olduğu gibi kalır.
  }
}

type ShareState = { kind: 'idle' } | { kind: 'copied' } | { kind: 'manual'; url: string }

/**
 * Sahne görüntüleyicisinin üstündeki katmanlar. Kök `pointer-events: none`; yalnızca düğmeler dokunma alır,
 * böylece görüntüleyici sürüklenebilir. Boş alana dokunmak katmanları gizler/gösterir.
 */
export function SceneOverlay({
  year,
  place,
  period,
  kind,
  attribution,
  onBack,
  onShare,
  onEditYear,
  onEditPlace,
  shareUrl,
}: SceneOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [hint, setHint] = useState(true)
  const [hidden, setHidden] = useState(false)
  const [idle, setIdle] = useState(false)
  const [attributionOpen, setAttributionOpen] = useState(false)
  const [share, setShare] = useState<ShareState>({ kind: 'idle' })
  const [fsSupported] = useState(fullscreenSupported)
  const [fullscreen, setFullscreen] = useState(() => currentFullscreenElement() !== null)
  const [canShare] = useState(() => typeof navigator.share === 'function')
  const attributionId = useId()
  const manualRef = useRef<HTMLInputElement>(null)

  // Jest ipucu: 3 sn sonra ya da ilk etkileşimde kaybolur.
  useEffect(() => {
    if (!hint) return
    const timer = setTimeout(() => setHint(false), HINT_MS)
    const dismiss = () => setHint(false)
    const opts = { capture: true, passive: true } as const
    window.addEventListener('pointerdown', dismiss, opts)
    window.addEventListener('wheel', dismiss, opts)
    window.addEventListener('keydown', dismiss, opts)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', dismiss, opts)
      window.removeEventListener('wheel', dismiss, opts)
      window.removeEventListener('keydown', dismiss, opts)
    }
  }, [hint])

  // Hareketsizlik: 4 sn sonra soluklaşır, herhangi bir hareketle geri gelir.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wake = useCallback(() => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS)
  }, [])
  useEffect(() => {
    wake()
    const opts = { capture: true, passive: true } as const
    const events = ['pointermove', 'pointerdown', 'wheel', 'keydown'] as const
    for (const e of events) window.addEventListener(e, wake, opts)
    return () => {
      clearTimeout(idleTimer.current)
      for (const e of events) window.removeEventListener(e, wake, opts)
    }
  }, [wake])

  // Boş alana dokunuş (sürükleme ya da çimdik değil) katmanları gizler/gösterir.
  useEffect(() => {
    const active = new Set<number>()
    let tap: { id: number; x: number; y: number; t: number } | null = null
    const opts = { capture: true, passive: true } as const
    const onDown = (e: PointerEvent) => {
      active.add(e.pointerId)
      const insideUi = rootRef.current?.contains(e.target as Node) ?? false
      tap = active.size === 1 && !insideUi && e.button <= 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null
    }
    const onMove = (e: PointerEvent) => {
      if (tap && e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MAX_MOVE) tap = null
    }
    const onUp = (e: PointerEvent) => {
      active.delete(e.pointerId)
      const t = tap
      tap = null
      if (!t || e.pointerId !== t.id) return
      const moved = Math.hypot(e.clientX - t.x, e.clientY - t.y)
      if (moved <= TAP_MAX_MOVE && performance.now() - t.t <= TAP_MAX_MS) setHidden((h) => !h)
    }
    const onCancel = (e: PointerEvent) => {
      active.delete(e.pointerId)
      tap = null
    }
    window.addEventListener('pointerdown', onDown, opts)
    window.addEventListener('pointermove', onMove, opts)
    window.addEventListener('pointerup', onUp, opts)
    window.addEventListener('pointercancel', onCancel, opts)
    return () => {
      window.removeEventListener('pointerdown', onDown, opts)
      window.removeEventListener('pointermove', onMove, opts)
      window.removeEventListener('pointerup', onUp, opts)
      window.removeEventListener('pointercancel', onCancel, opts)
    }
  }, [])

  // Klavyeyle gezinen kullanıcı gizli katmanlara Tab ile geri döner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') setHidden(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (!fsSupported) return
    const onChange = () => setFullscreen(currentFullscreenElement() !== null)
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [fsSupported])

  useEffect(() => {
    if (share.kind !== 'copied') return
    const timer = setTimeout(() => setShare({ kind: 'idle' }), COPIED_MS)
    return () => clearTimeout(timer)
  }, [share])

  useEffect(() => {
    if (share.kind === 'manual') manualRef.current?.select()
  }, [share])

  const title = overlayPlaceTitle(place)
  const yearLabel = formatYear(year)

  async function handleShare() {
    onShare()
    const url = safeShareUrl(shareUrl)
    if (canShare) {
      try {
        await navigator.share({ title: 'Time Portal', text: `${title} · ${yearLabel}`, url })
        return
      } catch (e) {
        // Kullanıcı vazgeçtiyse sessiz kal; başka bir hata olursa kopyalamaya düş.
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('clipboard yok')
      await navigator.clipboard.writeText(url)
      setShare({ kind: 'copied' })
    } catch {
      setShare({ kind: 'manual', url })
    }
  }

  const layerProps = hidden ? { inert: true, 'aria-hidden': true as const } : {}

  return (
    <div
      ref={rootRef}
      className={`scene-overlay${hidden ? ' is-hidden' : ''}${idle ? ' is-idle' : ''}`}
      data-motion={reduced ? 'reduced' : 'full'}
    >
      <header className="scene-overlay__top scene-overlay__layer" {...layerProps}>
        <button type="button" className="scene-overlay__icon" onClick={onBack} aria-label="Haritaya dön">
          ←
        </button>
        <div className="scene-overlay__heading">
          <h2 className="scene-overlay__title">{title}</h2>
          <p className="scene-overlay__note">{sceneYearNote(year, period)}</p>
        </div>
        {fsSupported && (
          <button
            type="button"
            className="scene-overlay__icon"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
            aria-pressed={fullscreen}
          >
            {fullscreen ? '⤡' : '⤢'}
          </button>
        )}
      </header>

      <div className="scene-overlay__chips scene-overlay__layer" {...layerProps}>
        <p className="scene-overlay__chip">
          <span aria-hidden="true">ⓘ </span>
          {NOTE_CHIP}
        </p>
        <p className="scene-overlay__badge">{kind === 'photo' ? '2.5B' : '360°'}</p>
      </div>

      {hint && !hidden && (
        <div className="scene-overlay__hint" data-testid="gesture-hint">
          <p>{kind === 'photo' ? 'Sürükle: sahnede gezin' : 'Sürükle: etrafına bak'}</p>
          <p>Çimdik ya da Ctrl + tekerlek: yakınlaş</p>
        </div>
      )}

      <div className="scene-overlay__bottom">
        {share.kind === 'copied' && (
          <p className="scene-overlay__toast" role="status">
            Bağlantı kopyalandı
          </p>
        )}
        {share.kind === 'manual' && (
          <div className="scene-overlay__manual">
            <label>
              Bağlantıyı kopyala
              <input ref={manualRef} readOnly value={share.url} onFocus={(e) => e.currentTarget.select()} />
            </label>
            <button type="button" onClick={() => setShare({ kind: 'idle' })}>
              Kapat
            </button>
          </div>
        )}

        <div className="scene-overlay__attribution">
          <p className="scene-overlay__attribution-line">{attributionLine(attribution)}</p>
          <button
            type="button"
            className="scene-overlay__attribution-toggle"
            aria-expanded={attributionOpen}
            aria-controls={attributionId}
            onClick={() => setAttributionOpen((o) => !o)}
          >
            Atıf <span aria-hidden="true">{attributionOpen ? '▴' : '▾'}</span>
          </button>
        </div>
        {attributionOpen && (
          <div id={attributionId} className="scene-overlay__attribution-panel">
            <Attribution attribution={attribution} />
          </div>
        )}

        <nav className="scene-overlay__bar scene-overlay__layer" aria-label="Sahne seçenekleri" {...layerProps}>
          <button type="button" onClick={onEditYear ?? onBack} aria-label={`Yılı değiştir: ${yearLabel}`}>
            <span className="scene-overlay__bar-label">Yıl</span>
            <span>{yearLabel} ✎</span>
          </button>
          <button type="button" onClick={onEditPlace ?? onBack} aria-label={`Yeri değiştir: ${overlayPlaceShort(place)}`}>
            <span className="scene-overlay__bar-label">Yer</span>
            <span>{overlayPlaceShort(place)} ✎</span>
          </button>
          <button type="button" className="scene-overlay__share" onClick={() => void handleShare()}>
            {canShare ? 'Paylaş' : 'Bağlantıyı kopyala'}
          </button>
        </nav>
      </div>
    </div>
  )
}
