import { ViewTransition } from 'react'
import { Link } from 'react-router'
import { formatYear } from '../lib/year'

/** Yıl seçimindeki hapın devamı; geçişte paylaşılan öğe (`yil-rozeti`). Dokununca yıl sayfasına döner. */
export function YearBadge({ year }: { year: number }) {
  const label = formatYear(year)
  return (
    <ViewTransition name="yil-rozeti">
      <Link to="/" className="yil-rozeti" aria-label={`Yılı değiştir: ${label}`}>
        {label}
      </Link>
    </ViewTransition>
  )
}

export function RouteNotice({ notice }: { notice?: string }) {
  if (!notice) return null
  return (
    <p className="route-notice" role="alert">
      {notice}
    </p>
  )
}
