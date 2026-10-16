import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { formatYear, MAX_YEAR, MIN_YEAR } from '../lib/year'
import {
  clampView,
  FULL_VIEW,
  panView,
  positionToYear,
  PRESENT_YEAR,
  stepYear,
  yearSpan,
  yearToPosition,
  zoomView,
} from './scale'
import type { View } from './scale'
import { computeTicks } from './ticks'
import './Timeline.css'

interface TimelineProps {
  value: number
  onChange: (year: number) => void
}

const SMALL_STEP = 1
const LARGE_STEP = 10
const FALLBACK_WIDTH = 600
const MIN_TICK_GAP_PX = 72
const DRAG_THRESHOLD_PX = 4
const KEY_ZOOM = 0.7

const isValidYear = (y: number) =>
  Number.isInteger(y) && y !== 0 && y >= MIN_YEAR && y <= MAX_YEAR

export function Timeline({ value, onChange }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(FULL_VIEW)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  const viewRef = useRef(view)
  viewRef.current = view

  const pointers = useRef(new Map<number, { x: number }>())
  const gesture = useRef({ startX: 0, dragging: false, pinchDist: 0 })

  const valid = isValidYear(value)
  const label = valid ? formatYear(value) : '—'

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(w)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Tekerlek: preventDefault için pasif olmayan dinleyici gerekir.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const w = rect.width || FALLBACK_WIDTH
      const unit = e.deltaMode === 1 ? 16 : 1 // satır modu
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      const v = viewRef.current
      if (Math.abs(dx) > Math.abs(dy)) {
        setView(panView(v, (dx / w) * (v.end - v.start)))
        return
      }
      const focus = v.start + ((e.clientX - rect.left) / w) * (v.end - v.start)
      setView(zoomView(v, focus, Math.exp(dy * 0.002)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const span = view.end - view.start
  const ticks = useMemo(() => computeTicks(view, width, MIN_TICK_GAP_PX), [view, width])

  const localPosition = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    const w = rect?.width || FALLBACK_WIDTH
    const x = clientX - (rect?.left ?? 0)
    return viewRef.current.start + (x / w) * (viewRef.current.end - viewRef.current.start)
  }

  const firstTwo = () => [...pointers.current.entries()].slice(0, 2)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointers.current.set(e.pointerId, { x: e.clientX })
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* yakalama desteklenmiyorsa sorun değil */
    }
    if (pointers.current.size === 1) {
      gesture.current.startX = e.clientX
      gesture.current.dragging = false
    } else {
      gesture.current.dragging = true // çoklu dokunuşta seçim yapma
      if (pointers.current.size === 2) {
        const [[, a], [, b]] = firstTwo()
        gesture.current.pinchDist = Math.abs(a.x - b.x)
      }
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const w = trackRef.current?.getBoundingClientRect().width || FALLBACK_WIDTH
    pointers.current.set(e.pointerId, { x: e.clientX })

    if (pointers.current.size > 1) {
      // Pinch yalnızca ilk iki pointer ile; fazlası yok sayılır.
      const pair = firstTwo()
      if (!pair.some(([id]) => id === e.pointerId)) return
      const [[, a], [, b]] = pair
      const dist = Math.abs(a.x - b.x)
      const old = gesture.current.pinchDist
      if (old > 0 && dist > 0) {
        setView(zoomView(viewRef.current, localPosition((a.x + b.x) / 2), old / dist))
      }
      gesture.current.pinchDist = dist
      return
    }

    if (!gesture.current.dragging && Math.abs(e.clientX - gesture.current.startX) > DRAG_THRESHOLD_PX) {
      gesture.current.dragging = true
    }
    if (gesture.current.dragging) {
      const v = viewRef.current
      setView(panView(v, (-(e.clientX - prev.x) / w) * (v.end - v.start)))
    }
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    const wasAlone = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    if (wasAlone && !gesture.current.dragging) {
      onChange(positionToYear(localPosition(e.clientX)))
    }
    if (pointers.current.size === 0) gesture.current.dragging = false
    else if (pointers.current.size === 2) {
      const [[, a], [, b]] = firstTwo()
      gesture.current.pinchDist = Math.abs(a.x - b.x)
    }
  }

  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) gesture.current.dragging = false
  }

  const select = (year: number) => {
    onChange(year)
    // Seçili yıl görünür kalsın.
    const p = yearToPosition(year)
    const v = viewRef.current
    if (p < v.start || p > v.end) {
      const half = (v.end - v.start) / 2
      setView(clampView({ start: p - half, end: p + half }))
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const base = valid ? value : PRESENT_YEAR
    const step = e.shiftKey ? LARGE_STEP : SMALL_STEP
    const v = viewRef.current
    const center = (v.start + v.end) / 2
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        select(stepYear(base, step))
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        select(stepYear(base, -step))
        break
      case 'PageUp':
      case 'PageDown': {
        const big = Math.max(100, Math.round(yearSpan(v) * 0.1))
        select(stepYear(base, e.key === 'PageUp' ? big : -big))
        break
      }
      case 'Home':
        select(MIN_YEAR)
        break
      case 'End':
        select(MAX_YEAR)
        break
      case '+':
      case '=':
        setView(zoomView(v, center, KEY_ZOOM))
        break
      case '-':
      case '_':
        setView(zoomView(v, center, 1 / KEY_ZOOM))
        break
      default:
        return
    }
    e.preventDefault()
  }

  const valuePos = valid ? yearToPosition(value) : -1
  const markerVisible = valuePos >= view.start && valuePos <= view.end

  return (
    <div className="timeline">
      <div className="timeline-selected" data-testid="timeline-selected" aria-hidden="true">
        {label}
      </div>
      <div
        ref={trackRef}
        className="timeline-track"
        role="slider"
        tabIndex={0}
        aria-label="Zaman çizgisi"
        aria-orientation="horizontal"
        aria-valuemin={MIN_YEAR}
        aria-valuemax={MAX_YEAR}
        aria-valuenow={valid ? value : undefined}
        aria-valuetext={valid ? label : 'Yıl seçilmedi'}
        data-view-start={view.start}
        data-view-end={view.end}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className="timeline-axis" />
        {ticks.map((t) => (
          <div
            key={t.year}
            className={`timeline-tick timeline-tick-${t.align}`}
            data-testid="timeline-tick"
            style={{ left: `${t.left}%` }}
          >
            <span className="timeline-tick-label">{formatYear(t.year)}</span>
          </div>
        ))}
        {markerVisible && (
          <div className="timeline-marker" style={{ left: `${((valuePos - view.start) / span) * 100}%` }} />
        )}
      </div>
      <div className="timeline-hint">Sürükle: kaydır · Tekerlek / çimdik: yakınlaştır · Tıkla: yıl seç</div>
    </div>
  )
}
