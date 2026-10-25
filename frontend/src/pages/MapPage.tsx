import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { MapSection } from '../location/MapSection'
import { formatCoordinates, type Selection } from '../location/coordinates'
import { formatYear } from '../lib/year'
import { mapPath, scenePath } from '../routing/paths'
import { writeStoredYear } from '../routing/storedYear'
import { useRouteGuard } from './routeGuard'
import type { RouteState } from './routeState'
import { RouteNotice, useOneTimeNotice, YearBadge } from './YearBadge'

/**
 * Geçici yer slug'ı: mevcut `MapSection` yalnızca enlem/boylam verir, il (plaka) bilinmez.
 * Koordinat `location.state` içinde taşınır. #63 `TurkeyMap` + `placeToSlug` ile bunu kaldıracak.
 */
export const UNRESOLVED_PLACE_SLUG = '00'

/** `/yil/:yil` ve `/yil/:yil/yer/:yer`: harita. */
export function MapPage() {
  const guard = useRouteGuard('map')
  if ('redirect' in guard) return guard.redirect
  return <MapContent year={guard.year} placeSlug={guard.placeSlug} state={guard.state} />
}

function MapContent({ year, placeSlug, state }: { year: number; placeSlug?: string; state: RouteState }) {
  const navigate = useNavigate()
  // Seçimin tek kaynağı geçmiş kaydı: geri tuşuyla dönüldüğünde seçim korunur.
  const selection = state.selection ?? null
  const notice = useOneTimeNotice()

  useEffect(() => writeStoredYear(year), [year])

  const onChange = (v: Selection | null) => {
    // Aynı sayfada seçim değişimi replace: geri tuşu her tıklamayı tek tek geri almaz.
    if (v) navigate(mapPath(year, UNRESOLVED_PLACE_SLUG), { replace: true, state: { selection: v } satisfies RouteState })
    else navigate(mapPath(year), { replace: true })
  }

  const seeScene = () => {
    if (!selection) return
    navigate(scenePath(year, placeSlug ?? UNRESOLVED_PLACE_SLUG), { state: { selection } satisfies RouteState })
  }

  const summary = `${formatYear(year)} · ${selection ? formatCoordinates(selection) : 'Haritadan konum seç'}`
  return (
    <section className="page page-map" aria-label="Harita">
      <div className="page-bar">
        <YearBadge year={year} />
      </div>
      <RouteNotice notice={notice} />
      <div className="panel">
        <MapSection value={selection} onChange={onChange} />
      </div>
      <div className="actions">
        <p className="summary">{summary}</p>
        <button type="button" className="generate" disabled={!selection} onClick={seeScene}>
          Sahneyi gör
        </button>
      </div>
    </section>
  )
}
