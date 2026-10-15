import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { formatYear, MAX_YEAR, MIN_YEAR } from '../lib/year'
import {
  clampView,
  FULL_VIEW,
  panView,
  positionToYear,
  stepYear,
  yearToPosition,
  zoomView,
} from './scale'
import type { View } from './scale'
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

/** Eksen etiketi adayları: 1-2-5 dizisi (her iki yönde) ve yakın geçmişten bilinen yıllar. */
const TICK_CANDIDATES: number[] = (() => {
  const set = new Set<number>([1, 1500, 1800, 1900, 1950, 2000, 2026])
  for (let m = 1; m <= MAX_YEAR; m *= 10) {
    for (const k of [1, 2, 5]) {
      const v = m * k
      if (v <= MAX_YEAR) {
        set.add(v)
        set.add(-v)
      }
    }
  }
  return [...set].filter((y) => y !== 0 && y >= MIN_YEAR && y <= MAX_YEAR).sort((a, b) => a - b)
})()

export function Timeline({ value, onChange }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(FULL_VIEW)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  const viewRef = useRef(view)
  viewRef.current = view

  const pointers = useRef(new Map<number, { x: number }>())
  const gesture = useRef({ startX: 0, dragging: false, pinchDist: 0 })

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
      const v = viewRef.current
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setView(panView(v, (e.deltaX / w) * (v.end - v.start)))
        return
      }
      const focus = v.start + ((e.clientX - rect.left) / w) * (v.end - v.start)
      setView(zoomView(v, focus, Math.exp(e.deltaY * 0.002)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const span = view.end - view.start
  const toPercent = (p: number) => ((p - view.start) / span) * 100

  const ticks = useMemo(() => {
    const result: { year: number; left: number }[] = []
    let lastX = -Infinity
    for (const year of TICK_CANDIDATES) {
      const p = yearToPosition(year)
      if (p < view.start || p > view.end) continue
      const x = ((p - view.start) / (view.end - view.start)) * width
      if (x - lastX >= MIN_TICK_GAP_PX) {
        result.push({ year, left: ((p - view.start) / (view.end - view.start)) * 100 })
        lastX = x
      }
    }
    return result
  }, [view, width])

  const localPosition = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    const w = rect?.width || FALLBACK_WIDTH
    const x = clientX - (rect?.left ?? 0)
    return viewRef.current.start + (x / w) * (viewRef.current.end - viewRef.current.start)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX })
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* yakalama desteklenmiyorsa sorun değil */
    }
    gesture.current.startX = e.clientX
    gesture.current.dragging = false
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.pinchDist = Math.abs(a.x - b.x)
      gesture.current.dragging = true // pinch sırasında seçim yapma
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const w = trackRef.current?.getBoundingClientRect().width || FALLBACK_WIDTH
    pointers.current.set(e.pointerId, { x: e.clientX })

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
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
    const step = e.shiftKey ? LARGE_STEP : SMALL_STEP
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        select(stepYear(value, step))
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        select(stepYear(value, -step))
        break
      case 'Home':
        select(MIN_YEAR)
        break
      case 'End':
        select(MAX_YEAR)
        break
      default:
        return
    }
    e.preventDefault()
  }

  const valuePos = yearToPosition(value)
  const markerVisible = valuePos >= view.start && valuePos <= view.end

  return (
    <div className="timeline">
      <div className="timeline-selected" data-testid="timeline-selected" aria-hidden="true">
        {formatYear(value)}
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
        aria-valuenow={value}
        aria-valuetext={formatYear(value)}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className="timeline-axis" />
        {ticks.map((t) => (
          <div key={t.year} className="timeline-tick" data-testid="timeline-tick" style={{ left: `${t.left}%` }}>
            <span className="timeline-tick-label">{formatYear(t.year)}</span>
          </div>
        ))}
        {markerVisible && <div className="timeline-marker" style={{ left: `${toPercent(valuePos)}%` }} />}
      </div>
      <div className="timeline-hint">Sürükle: kaydır · Tekerlek / çimdik: yakınlaştır · Tıkla: yıl seç</div>
    </div>
  )
}
