import { useState, ViewTransition } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Timeline } from '../timeline/Timeline'
import { formatYear } from '../lib/year'
import { mapPath } from '../routing/paths'
import { readStoredYear, writeStoredYear } from '../routing/storedYear'
import { isValidYear } from '../routing/yearSlug'
import { readRouteState } from './routeState'
import { RouteNotice } from './YearBadge'

const DEFAULT_YEAR = 2026

/** `/`: yıl seçimi. #63 burada `HoyukYearPicker`'ı takacak; şimdilik mevcut zaman çizgisi. */
export function YearPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [year, setYear] = useState(() => readStoredYear() ?? DEFAULT_YEAR)
  const { notice } = readRouteState(location.state)
  const valid = isValidYear(year)

  const go = () => {
    if (!valid) return
    writeStoredYear(year)
    navigate(mapPath(year))
  }

  return (
    <section className="page page-year" aria-label="Yıl seçimi">
      <p className="intro">Bir tarih ve konum seç, o anı 3 boyutlu keşfet.</p>
      <RouteNotice notice={notice} />
      <div className="panel">
        <Timeline value={year} onChange={setYear} />
      </div>
      <div className="actions">
        <ViewTransition name="yil-rozeti">
          <span className="yil-rozeti" data-testid="yil-hapi">
            {valid ? formatYear(year) : '—'}
          </span>
        </ViewTransition>
        <button type="button" className="generate" disabled={!valid} onClick={go}>
          Bu yıla git
        </button>
      </div>
    </section>
  )
}
