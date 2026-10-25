import { useState } from 'react'
import { useNavigate } from 'react-router'
import { HoyukYearPicker } from '../year/HoyukYearPicker'
import { mapPath } from '../routing/paths'
import { readStoredYear, writeStoredYear } from '../routing/storedYear'
import { isValidYear } from '../routing/yearSlug'
import { RouteNotice, useOneTimeNotice } from './YearBadge'

const DEFAULT_YEAR = 2026

/**
 * `/`: yıl seçimi (höyük kesiti). Açılışta son yıl `tp.year`'dan.
 * Höyük, yeni bir yıl bildirdiyse `onConfirm`'ü bir render sonra çağırır; bu yüzden `go` her zaman güncel yılı okur.
 * Yıl hapı (`.hoyuk-pill`) haritadaki yıl rozetiyle paylaşılan geçiş öğesidir (`view-transition-name`, App.css).
 */
export function YearPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState(() => readStoredYear() ?? DEFAULT_YEAR)
  const notice = useOneTimeNotice()

  const go = () => {
    if (!isValidYear(year)) return
    writeStoredYear(year)
    navigate(mapPath(year))
  }

  return (
    <section className="page page-year" aria-label="Yıl seçimi">
      <RouteNotice notice={notice} />
      <HoyukYearPicker value={year} onChange={setYear} onConfirm={go} />
    </section>
  )
}
