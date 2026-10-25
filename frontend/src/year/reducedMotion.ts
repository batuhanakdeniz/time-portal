import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(QUERY)
}

/** Kullanıcı hareketi azaltmayı istiyor mu? matchMedia yoksa (jsdom, eski tarayıcı) false. */
export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false
}

/** `prefers-reduced-motion` değerini izleyen kanca. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    const mq = mediaQuery()
    if (!mq) return
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])
  return reduced
}

/** Tarayıcı CSS scroll-driven animasyonlarını destekliyor mu (Firefox kararlıda yok)? */
export function supportsScrollTimeline(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timeline: view()')
}
