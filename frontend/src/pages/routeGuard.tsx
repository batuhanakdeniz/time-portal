import type { ReactElement } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'
import { isEntryPoint, mapPath, scenePath } from '../routing/paths'
import { parsePlaceSlug } from '../routing/placeSlug'
import { parseYearSlug } from '../routing/yearSlug'
import { INVALID_PLACE_NOTICE, INVALID_YEAR_NOTICE, readRouteState, type RouteState } from './routeState'

export type Guarded =
  | { redirect: ReactElement }
  | { year: number; placeSlug: string | undefined; state: RouteState; entry: boolean }

/**
 * `:yil` ve `:yer` parçalarını denetler:
 * geçersiz yıl → `/` (mesajla), geçersiz yer → yılın haritası (mesajla), kanonik olmayan yıl → kanonik adres.
 * Hepsi `replace`; kanonik adrese geçerken derin bağlantı bilgisi (`entry`) ve seçim korunur.
 */
export function useRouteGuard(page: 'map' | 'scene'): Guarded {
  const { yil, yer } = useParams()
  const location = useLocation()
  const state = readRouteState(location.state)
  const entry = isEntryPoint(location)

  const parsed = parseYearSlug(yil)
  if (!parsed) {
    return { redirect: <Navigate to="/" replace state={{ notice: INVALID_YEAR_NOTICE } satisfies RouteState} /> }
  }
  if (yer !== undefined && !parsePlaceSlug(yer)) {
    return { redirect: <Navigate to={mapPath(parsed.year)} replace state={{ notice: INVALID_PLACE_NOTICE } satisfies RouteState} /> }
  }
  if (!parsed.canonical) {
    const to = page === 'scene' && yer !== undefined ? scenePath(parsed.year, yer) : mapPath(parsed.year, yer)
    const next: RouteState = { ...state, ...(entry ? { entry: true } : {}) }
    return { redirect: <Navigate to={to} replace state={next} /> }
  }
  return { year: parsed.year, placeSlug: yer, state, entry }
}
