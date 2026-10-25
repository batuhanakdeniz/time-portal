import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent } from 'react'
import { formatYear, MAX_YEAR, MIN_YEAR } from '../lib/year'
import { PRESENT_YEAR, stepYear } from '../timeline/scale'
import {
  displayYearAt,
  easeInOut,
  gaugeFractionToOffset,
  INTRO_TOTAL_MS,
  introDelay,
  jumpDuration,
  layerBands,
  parallaxShift,
  screenLabel,
  starShift,
  TOTAL_HEIGHT,
  yearToOffset,
} from './hoyukGeometry'
import { bucketIndexOf, hasScene, periodBoundaryStep, periodNote, PERIODS, type Period } from './periods'
import { prefersReducedMotion, supportsScrollTimeline, useReducedMotion } from './reducedMotion'
import { Silhouette } from './silhouettes'
import { parseYearInput, yearToDraft, type Era } from './yearInput'
import './HoyukYearPicker.css'

export interface HoyukYearPickerProps {
  value: number
  onChange(year: number): void
  onConfirm(): void
}

export const SHORTCUTS: readonly { label: string; year: number }[] = [
  { label: 'Göbeklitepe', year: -9600 },
  { label: 'Truva', year: -1200 },
  { label: 'Fetih', year: 1453 },
  { label: 'Cumhuriyet', year: 1923 },
  { label: 'Bugün', year: 2026 },
]

/** Kaydırma durdu sayılması için beklenen süre (≤120 ms). */
export const SCROLL_IDLE_MS = 100
const STAR_TILE = 400
const ARTIFACT_FACTOR = 1.08
const ARTIFACT_SIZE = 56
const GAUGE_LABELS = [MAX_YEAR, 10000, 2100, PRESENT_YEAR, 1, -10000, MIN_YEAR]

const isValidYear = (y: number) => Number.isInteger(y) && y !== 0 && y >= MIN_YEAR && y <= MAX_YEAR

const raf: (cb: FrameRequestCallback) => number =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number
const cancelRaf: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id)
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function periodRange(p: Period): string {
  return `${formatYear(p.yearFrom)} – ${formatYear(Math.min(p.yearTo, MAX_YEAR))}`
}

/** Ekran okuyucu metni: "1453, Osmanlı klasik". */
export function sliderValueText(year: number): string {
  const p = PERIODS[bucketIndexOf(year)]
  if (!p) return formatYear(year)
  return `${formatYear(year)}, ${p.name}${hasScene(p) ? '' : ', sahne henüz yok'}`
}

function layerColor(index: number): string {
  // Derine indikçe koyulaşan toprak tonları; komşu katmanlar ayırt edilsin diye dönüşümlü.
  const l = 8 + (index / 12) * 12 + (index % 2 ? 2 : 0)
  return `hsl(${22 + index} 24% ${l.toFixed(1)}%)`
}

type Sheet = 'none' | 'input' | 'shortcuts'

/**
 * Höyük kesiti yıl seçicisi (Konsept C). Kendi kaydırma kabını yönetir (`height: 100dvh`):
 * okuma çizgisi kabın ortasında sabit, aşağısı geçmiş, yukarısı gelecek.
 */
export function HoyukYearPicker({ value, onChange, onConfirm }: HoyukYearPickerProps) {
  const year = isValidYear(value) ? value : PRESENT_YEAR
  const period = PERIODS[bucketIndexOf(year)]
  const reduced = useReducedMotion()

  const [intro, setIntro] = useState<'play' | 'done'>(() => (prefersReducedMotion() ? 'done' : 'play'))
  const [sheet, setSheet] = useState<Sheet>('none')
  const [draft, setDraft] = useState(() => yearToDraft(year).text)
  const [era, setEra] = useState<Era>(() => yearToDraft(year).era)
  const [inputError, setInputError] = useState<string | null>(null)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const pillTextRef = useRef<HTMLSpanElement>(null)
  const scaleRef = useRef<HTMLDivElement>(null)
  const gaugeTrackRef = useRef<HTMLDivElement>(null)
  const gaugeThumbRef = useRef<HTMLDivElement>(null)
  const starsRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const layerEls = useRef<(HTMLElement | null)[]>([])
  const artifactEls = useRef<(HTMLElement | null)[]>([])

  const valueRef = useRef(year)
  valueRef.current = year
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced

  /** Okuma çizgisindeki (ya da atlamanın hedefindeki) yıl. */
  const currentYearRef = useRef(year)
  /** Programatik konumlandırmada kesin yıl: scrollTop bu ofsetteyse yuvarlanmaz. */
  const pinnedRef = useRef<{ year: number; offset: number } | null>(null)
  const animRef = useRef<{ id: number } | null>(null)
  const frameRef = useRef<number | null>(null)
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightRef = useRef(-1)
  const visibleArtifacts = useRef(new Set<HTMLElement>())
  const fallbackParallax = useRef(false)
  const dragRef = useRef(false)

  const bands = useMemo(() => layerBands(), [])
  const groundOffset = useMemo(() => yearToOffset(PRESENT_YEAR), [])
  const introIndex = useRef(bucketIndexOf(year)).current

  const yearUnderLine = useCallback((): number => {
    const el = scrollerRef.current
    if (!el) return currentYearRef.current
    const s = el.scrollTop
    const pinned = pinnedRef.current
    if (pinned && Math.abs(s - pinned.offset) <= 1) return pinned.year
    return displayYearAt(s)
  }, [])

  // Kare başına DOM yazımı: hap, ölçek etiketi, gösterge, yıldızlar, vurgu, paralaks yedeği. React render yok.
  const paint = useCallback(() => {
    frameRef.current = null
    const el = scrollerRef.current
    if (!el) return
    const s = el.scrollTop
    const vh = el.clientHeight || 800
    const shown = yearUnderLine()
    if (!animRef.current) {
      currentYearRef.current = shown
      const pinned = pinnedRef.current
      if (pinned && Math.abs(s - pinned.offset) > 1) pinnedRef.current = null
    }

    const text = formatYear(shown)
    if (pillTextRef.current && pillTextRef.current.textContent !== text) pillTextRef.current.textContent = text
    const label = screenLabel(s, vh)
    if (scaleRef.current && scaleRef.current.textContent !== label) scaleRef.current.textContent = label
    if (gaugeThumbRef.current) {
      gaugeThumbRef.current.style.transform = `translate3d(0, ${((s / TOTAL_HEIGHT) * 100).toFixed(3)}%, 0)`
    }
    if (!reducedRef.current && starsRef.current) {
      starsRef.current.style.transform = `translate3d(0, ${starShift(s, STAR_TILE).toFixed(1)}px, 0)`
    }
    const idx = bucketIndexOf(shown)
    if (idx !== highlightRef.current) {
      layerEls.current[highlightRef.current]?.classList.remove('is-current')
      layerEls.current[idx]?.classList.add('is-current')
      highlightRef.current = idx
    }
    if (fallbackParallax.current && !reducedRef.current) {
      for (const a of visibleArtifacts.current) {
        const center = Number(a.dataset.center)
        const svg = a.firstElementChild as HTMLElement | SVGElement | null
        if (svg) svg.style.transform = `translate3d(0, ${parallaxShift(s, center, ARTIFACT_FACTOR).toFixed(1)}px, 0)`
      }
    }
  }, [yearUnderLine])

  const schedulePaint = useCallback(() => {
    if (frameRef.current == null) frameRef.current = raf(paint)
  }, [paint])

  const emitIfChanged = useCallback(() => {
    idleRef.current = null
    if (animRef.current || dragRef.current) return
    const y = yearUnderLine()
    currentYearRef.current = y
    if (y !== valueRef.current) onChangeRef.current(y)
  }, [yearUnderLine])

  const scheduleIdle = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current)
    idleRef.current = setTimeout(emitIfChanged, SCROLL_IDLE_MS)
  }, [emitIfChanged])

  const placeInstant = useCallback(
    (target: number) => {
      const el = scrollerRef.current
      currentYearRef.current = target
      if (!el) return
      el.scrollTop = yearToOffset(target)
      pinnedRef.current = { year: target, offset: el.scrollTop }
      schedulePaint()
    },
    [schedulePaint],
  )

  const cancelJump = useCallback(() => {
    if (!animRef.current) return
    cancelRaf(animRef.current.id)
    animRef.current = null
    pinnedRef.current = null
    scheduleIdle()
  }, [scheduleIdle])

  /** "Kazı uçuşu": 700–1200 ms ease-in-out; reduced motion'da anında. */
  const jumpTo = useCallback(
    (target: number) => {
      const el = scrollerRef.current
      if (animRef.current) {
        cancelRaf(animRef.current.id)
        animRef.current = null
      }
      if (!el) {
        currentYearRef.current = target
        return
      }
      const from = el.scrollTop
      const to = yearToOffset(target)
      const duration = jumpDuration(to - from, reducedRef.current)
      if (duration === 0) {
        placeInstant(target)
        return
      }
      currentYearRef.current = target
      pinnedRef.current = null
      const start = now()
      const anim = { id: 0 }
      const step = () => {
        if (animRef.current !== anim) return
        const t = (now() - start) / duration
        if (t >= 1) {
          animRef.current = null
          placeInstant(target)
          return
        }
        el.scrollTop = from + (to - from) * easeInOut(t)
        paint() // zaten bir kare içindeyiz; scroll olayını beklemeden hap/göstergeyi güncelle
        anim.id = raf(step)
      }
      animRef.current = anim
      anim.id = raf(step)
    },
    [paint, placeInstant],
  )

  /** Yılı seç: üst bileşene bildir ve kesiti oraya getir. */
  const select = useCallback(
    (target: number, mode: 'instant' | 'jump') => {
      if (target !== valueRef.current) onChangeRef.current(target)
      if (mode === 'instant') {
        cancelJump()
        placeInstant(target)
      } else jumpTo(target)
    },
    [cancelJump, jumpTo, placeInstant],
  )

  // İlk yerleşim: kesiti başlangıç yılına getir.
  useLayoutEffect(() => {
    placeInstant(valueRef.current)
  }, [placeInstant])

  // Dışarıdan gelen değer değişimi (ör. üst bileşen): kesiti oraya uçur.
  useEffect(() => {
    if (year !== currentYearRef.current) jumpTo(year)
  }, [year, jumpTo])

  // Yazma alanı, odakta değilken seçili yılı izler.
  useEffect(() => {
    if (typeof document !== 'undefined' && document.activeElement === inputRef.current) return
    const d = yearToDraft(year)
    setDraft(d.text)
    setEra(d.era)
  }, [year])

  useEffect(() => {
    if (reduced) setIntro('done')
  }, [reduced])

  useEffect(() => {
    if (intro !== 'play') return
    const t = setTimeout(() => setIntro('done'), INTRO_TOTAL_MS)
    return () => clearTimeout(t)
  }, [intro])

  useEffect(() => {
    if (sheet === 'input') inputRef.current?.focus()
  }, [sheet])

  // Scroll-driven animasyon yoksa (Firefox): IntersectionObserver + rAF ile eser paralaksı.
  useEffect(() => {
    if (reduced || supportsScrollTimeline() || typeof IntersectionObserver === 'undefined') {
      fallbackParallax.current = false
      return
    }
    fallbackParallax.current = true
    const visible = visibleArtifacts.current
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const target = e.target as HTMLElement
          if (e.isIntersecting) visible.add(target)
          else visible.delete(target)
        }
        schedulePaint()
      },
      { root: scrollerRef.current, rootMargin: '25% 0px' },
    )
    for (const a of artifactEls.current) if (a) io.observe(a)
    return () => {
      io.disconnect()
      visible.clear()
      fallbackParallax.current = false
    }
  }, [reduced, schedulePaint])

  // Yeniden boyutlanınca gösterge ve etiket yeniden çizilsin.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener('resize', schedulePaint)
    return () => window.removeEventListener('resize', schedulePaint)
  }, [schedulePaint])

  useEffect(
    () => () => {
      if (animRef.current) cancelRaf(animRef.current.id)
      if (frameRef.current != null) cancelRaf(frameRef.current)
      if (idleRef.current) clearTimeout(idleRef.current)
    },
    [],
  )

  const skipIntro = () => {
    if (intro === 'play') setIntro('done')
  }

  const onUserInput = () => {
    skipIntro()
    cancelJump()
  }

  const onScroll = () => {
    schedulePaint()
    if (!animRef.current) scheduleIdle()
  }

  const onSliderKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const base = currentYearRef.current
    const step = e.shiftKey ? 10 : 1
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        select(stepYear(base, step), 'instant')
        break
      case 'ArrowDown':
      case 'ArrowLeft':
        select(stepYear(base, -step), 'instant')
        break
      case 'PageUp':
        select(periodBoundaryStep(base, 1), 'jump')
        break
      case 'PageDown':
        select(periodBoundaryStep(base, -1), 'jump')
        break
      case 'Home':
        select(MIN_YEAR, 'jump')
        break
      case 'End':
        select(MAX_YEAR, 'jump')
        break
      case 'Enter':
        onConfirm()
        break
      default:
        return
    }
    e.preventDefault()
  }

  const scrollToGauge = (clientY: number) => {
    const track = gaugeTrackRef.current
    const el = scrollerRef.current
    if (!track || !el) return
    const rect = track.getBoundingClientRect()
    const fraction = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5
    pinnedRef.current = null
    el.scrollTop = gaugeFractionToOffset(fraction)
    schedulePaint()
  }

  const onGaugeDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragRef.current = true
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* yakalama desteklenmiyorsa sorun değil */
    }
    scrollToGauge(e.clientY)
  }
  const onGaugeMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) scrollToGauge(e.clientY)
  }
  const onGaugeUp = () => {
    if (!dragRef.current) return
    dragRef.current = false
    scheduleIdle()
  }

  const onSubmitYear = (e: FormEvent) => {
    e.preventDefault()
    const r = parseYearInput(draft, era)
    if (!r.ok) {
      setInputError(r.error)
      return
    }
    setInputError(null)
    // Aynı yıl zaten seçiliyse Enter onaylar; değilse önce oraya gider.
    if (r.year === valueRef.current && r.year === currentYearRef.current) onConfirm()
    else select(r.year, 'jump')
  }

  const onShortcut = (target: number) => {
    setSheet('none')
    select(target, 'jump')
  }

  const toggleSheet = (s: Sheet) => setSheet((cur) => (cur === s ? 'none' : s))

  const strata = useMemo(
    () =>
      bands.map((b) => {
        const kurgu = !hasScene(b.period)
        const isGround = b.period.id === 'bugun'
        const groundInBand = groundOffset - b.top
        const artifactTop = isGround
          ? groundInBand - ARTIFACT_SIZE
          : Math.min(Math.max(b.height / 2 - ARTIFACT_SIZE / 2, 8), 220)
        const sky = b.period.yearFrom >= PRESENT_YEAR
        const color = layerColor(b.index)
        const background = sky
          ? 'transparent'
          : isGround
            ? `linear-gradient(to bottom, transparent ${groundInBand.toFixed(1)}px, ${color} ${groundInBand.toFixed(1)}px)`
            : color
        const style = {
          height: `${b.height}px`,
          background,
          '--intro-delay': `${introDelay(b.index, introIndex)}ms`,
          '--artifact-x': `${[64, 74, 58, 70, 62][b.index % 5]}%`,
        } as CSSProperties
        return (
          <section
            key={b.period.id}
            ref={(el) => {
              layerEls.current[b.index] = el
            }}
            className={`hoyuk-layer${kurgu ? ' hoyuk-layer--kurgu' : ''}${sky ? ' hoyuk-layer--sky' : ''}`}
            data-period={b.period.id}
            style={style}
          >
            <div className="hoyuk-layer-label">
              <span className="hoyuk-layer-name">{b.period.name}</span>
              <span className="hoyuk-layer-range">{periodRange(b.period)}</span>
              {kurgu && <span className="hoyuk-badge">Sahne henüz yok</span>}
            </div>
            <div
              className="hoyuk-artifact"
              ref={(el) => {
                artifactEls.current[b.index] = el
              }}
              data-center={(b.top + artifactTop + ARTIFACT_SIZE / 2).toFixed(1)}
              style={{ top: `${artifactTop}px` }}
            >
              <Silhouette id={b.period.id} />
            </div>
          </section>
        )
      }),
    [bands, groundOffset, introIndex],
  )

  const confirmLabel = 'Bu yıla git'
  const errorId = 'hoyuk-year-error'

  return (
    <div
      className="hoyuk"
      data-intro={intro}
      data-reduced-motion={reduced ? 'true' : 'false'}
      data-sheet={sheet}
      onPointerDownCapture={onUserInput}
      onWheelCapture={onUserInput}
      onTouchStartCapture={onUserInput}
      onKeyDownCapture={skipIntro}
    >
      <div className="hoyuk-cut">
        <div className="hoyuk-stars" ref={starsRef} aria-hidden="true" />
        <div
          ref={scrollerRef}
          className="hoyuk-scroller"
          role="slider"
          tabIndex={0}
          aria-label="Yıl seçimi: höyük kesiti. Aşağı geçmiş, yukarı gelecek"
          aria-orientation="vertical"
          aria-valuemin={MIN_YEAR}
          aria-valuemax={MAX_YEAR}
          aria-valuenow={year}
          aria-valuetext={sliderValueText(year)}
          data-testid="hoyuk-scroller"
          onScroll={onScroll}
          onKeyDown={onSliderKeyDown}
        >
          <div className="hoyuk-pad" />
          <div className="hoyuk-strata" style={{ height: `${TOTAL_HEIGHT}px` }}>
            {strata}
            <div className="hoyuk-ground" style={{ top: `${groundOffset}px` }}>
              <span>Bugün · {formatYear(PRESENT_YEAR)}</span>
            </div>
          </div>
          <div className="hoyuk-pad" />
        </div>

        <div className="hoyuk-overlay" aria-hidden="true">
          <div className="hoyuk-fade hoyuk-fade--top" />
          <div className="hoyuk-hint hoyuk-hint--up">gelecek ↑ (yüksel)</div>
          <div className="hoyuk-hint hoyuk-hint--down">geçmiş ↓ (kaz)</div>
          <div className="hoyuk-scale" ref={scaleRef} data-testid="hoyuk-scale">
            {screenLabel(yearToOffset(year), 800)}
          </div>
          <div className="hoyuk-line" />
          <div className="hoyuk-pill" data-testid="hoyuk-pill">
            <span ref={pillTextRef}>{formatYear(year)}</span>
          </div>
        </div>

        <div
          className="hoyuk-gauge"
          aria-hidden="true"
          data-testid="hoyuk-gauge"
          onPointerDown={onGaugeDown}
          onPointerMove={onGaugeMove}
          onPointerUp={onGaugeUp}
          onPointerCancel={onGaugeUp}
        >
          <div className="hoyuk-gauge-track" ref={gaugeTrackRef}>
            {PERIODS.slice(1).map((p) => (
              <span
                key={p.id}
                className="hoyuk-gauge-tick"
                style={{ top: `${(yearToOffset(p.yearFrom) / TOTAL_HEIGHT) * 100}%` }}
              />
            ))}
            {GAUGE_LABELS.map((y) => (
              <span
                key={y}
                className="hoyuk-gauge-label"
                style={{ top: `${(yearToOffset(y) / TOTAL_HEIGHT) * 100}%` }}
              >
                {formatYear(y)}
              </span>
            ))}
            {/* Ray izin boyunda: translateY(%) kendi yüksekliğine göre olduğundan yerleşim okumadan konumlanır. */}
            <div
              className="hoyuk-gauge-rail"
              ref={gaugeThumbRef}
              style={{ transform: `translate3d(0, ${((yearToOffset(year) / TOTAL_HEIGHT) * 100).toFixed(3)}%, 0)` }}
            >
              <div className="hoyuk-gauge-thumb" />
            </div>
          </div>
        </div>
      </div>

      <aside className="hoyuk-panel" aria-label="Yıl seçimi">
        <div className="hoyuk-summary">
          <div className="hoyuk-summary-year" data-testid="hoyuk-summary-year">
            {formatYear(year)}
          </div>
          <div className="hoyuk-summary-period">
            {period.name} · {periodRange(period)}
          </div>
          <p className={`hoyuk-note${hasScene(period) ? '' : ' hoyuk-note--none'}`} data-testid="hoyuk-note">
            {periodNote(period)}
          </p>
        </div>

        <div className="hoyuk-section hoyuk-section--input">
          <form className="hoyuk-form" onSubmit={onSubmitYear} noValidate>
            <label className="hoyuk-section-title" htmlFor="hoyuk-year-input">
              Yıl yaz
            </label>
            <div className="hoyuk-form-row">
              <input
                id="hoyuk-year-input"
                ref={inputRef}
                className="hoyuk-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="go"
                placeholder="1453"
                value={draft}
                aria-invalid={inputError ? true : undefined}
                aria-describedby={inputError ? errorId : undefined}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setInputError(null)
                }}
              />
              <div className="hoyuk-era" role="group" aria-label="Çağ">
                {(['MÖ', 'MS'] as const).map((x) => (
                  <button
                    key={x}
                    type="button"
                    className="hoyuk-era-btn"
                    aria-pressed={era === x}
                    onClick={() => setEra(x)}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
            {inputError && (
              <p className="hoyuk-error" id={errorId} role="alert">
                {inputError}
              </p>
            )}
          </form>
        </div>

        <div className="hoyuk-section hoyuk-section--shortcuts">
          <div className="hoyuk-section-title" id="hoyuk-shortcuts-title">
            Kısayollar
          </div>
          <div className="hoyuk-shortcuts" role="group" aria-labelledby="hoyuk-shortcuts-title">
            {SHORTCUTS.map((s) => (
              <button
                key={s.year}
                type="button"
                className="hoyuk-chip"
                aria-pressed={year === s.year}
                onClick={() => onShortcut(s.year)}
              >
                {s.label === 'Bugün' ? 'Bugün' : `${s.label} · ${formatYear(s.year)}`}
              </button>
            ))}
          </div>
        </div>

        <div className="hoyuk-chips-mobile">
          <button type="button" className="hoyuk-chip" onClick={() => onShortcut(PRESENT_YEAR)}>
            Bugün
          </button>
          <button
            type="button"
            className="hoyuk-chip"
            aria-expanded={sheet === 'input'}
            onClick={() => toggleSheet('input')}
          >
            Yıl yaz
          </button>
          <button
            type="button"
            className="hoyuk-chip"
            aria-expanded={sheet === 'shortcuts'}
            onClick={() => toggleSheet('shortcuts')}
          >
            Kısayollar {sheet === 'shortcuts' ? '▴' : '▾'}
          </button>
        </div>

        <button type="button" className="hoyuk-confirm" onClick={onConfirm}>
          {confirmLabel} <span aria-hidden="true">→</span>
        </button>

        <ul className="hoyuk-keys" aria-label="Klavye kısayolları">
          <li>↑ ↓ 1 yıl · Shift + ↑ ↓ 10 yıl</li>
          <li>PgUp / PgDn dönem · Home / End uçlar</li>
          <li>Enter: bu yıla git</li>
          <li>Tekerlek, sürükleme ya da kaydırma: kaz ↓ / yüksel ↑</li>
        </ul>
      </aside>
    </div>
  )
}
