import { useEffect, useState, ViewTransition } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { formatYear } from '../lib/year'
import { readRouteState } from './routeState'

/**
 * Yönlendirmeyle gelen mesajı bir kez okur ve geçmiş kaydından siler (replace);
 * böylece geri/ileri ya da yenilemede tekrar görünmez. Sayfa açık kaldıkça mesaj ekranda kalır.
 */
export function useOneTimeNotice(): string | undefined {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice] = useState(() => readRouteState(location.state).notice)

  useEffect(() => {
    const state = readRouteState(location.state)
    if (state.notice === undefined) return
    const rest = { ...state }
    delete rest.notice
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: rest })
  }, [location, navigate])

  return notice
}

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
