import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { LazyTurkeyMap } from './LazyTurkeyMap'
import { PlaceSearch } from '../location/PlaceSearch'
import { placeToSlug, type PlaceSelection } from '../location/place'
import { usePlaces, type PlacesData } from '../location/places'
import { mapPath, scenePath } from '../routing/paths'
import { writeStoredYear } from '../routing/storedYear'
import { useRouteGuard } from './routeGuard'
import { INVALID_PLACE_NOTICE } from './routeState'
import { RouteNotice, useOneTimeNotice, YearBadge } from './YearBadge'

/** `/yil/:yil` ve `/yil/:yil/yer/:yer`: harita. */
export function MapPage() {
  const guard = useRouteGuard('map')
  if ('redirect' in guard) return guard.redirect
  return <MapContent year={guard.year} placeSlug={guard.placeSlug} />
}

/** Alt sayfa metni: "İstanbul · 39 ilçe · ilçe seçmek isteğe bağlı" ya da "Beyoğlu, İstanbul". */
export function selectionSummary(p: PlaceSelection, data: PlacesData | null): string {
  if (p.district) return `${p.district.name}, ${p.province}`
  const n = data?.districtsByPlate.get(p.plate)?.length
  return n ? `${p.province} · ${n} ilçe · ilçe seçmek isteğe bağlı` : `${p.province} · ilçe seçmek isteğe bağlı`
}

function MapContent({ year, placeSlug }: { year: number; placeSlug?: string }) {
  const navigate = useNavigate()
  const { state, findBySlug } = usePlaces()
  const notice = useOneTimeNotice()
  // Bilinmeyen yer slug'ı bu sayfa açıkken düzeltildiğinde (aynı bileşen kalır) gösterilen mesaj.
  const [localNotice, setLocalNotice] = useState<string>()

  // Seçimin tek kaynağı URL: `:yer` → PlaceSelection. Geri tuşu ve derin bağlantı aynı yoldan çözülür.
  const selected = useMemo(
    () => (placeSlug !== undefined && state.status === 'ready' ? findBySlug(placeSlug) : null),
    [placeSlug, state.status, findBySlug],
  )
  const unknownPlace = placeSlug !== undefined && state.status === 'ready' && selected === null

  useEffect(() => writeStoredYear(year), [year])

  useEffect(() => {
    if (!unknownPlace) return
    setLocalNotice(INVALID_PLACE_NOTICE)
    navigate(mapPath(year), { replace: true })
  }, [unknownPlace, year, navigate])

  const onSelect = (p: PlaceSelection) => {
    setLocalNotice(undefined)
    // Aynı sayfada seçim değişimi replace: geri tuşu her tıklamayı tek tek geri almaz.
    navigate(mapPath(year, placeToSlug(p)), { replace: true })
  }

  const seeScene = () => {
    if (selected) navigate(scenePath(year, placeToSlug(selected)))
  }

  return (
    <section className="page page-map" aria-label="Harita">
      <div className="map-bar">
        <YearBadge year={year} />
        <div className="map-heading">
          <h2>Nereye gidiyoruz?</h2>
          <p>Bir il seç; istersen ilçeye in.</p>
        </div>
      </div>
      <RouteNotice notice={notice ?? localNotice} />
      <div className="map-search">
        <PlaceSearch selected={selected} onSelect={onSelect} />
      </div>
      <div className="map-canvas">
        <LazyTurkeyMap selected={selected} onSelect={onSelect} />
      </div>
      <div className="map-sheet">
        <p className="map-sheet-summary" data-testid="map-summary">
          {selected ? selectionSummary(selected, state.data) : 'Haritadan ya da aramadan bir il seç.'}
        </p>
        <button type="button" className="generate" disabled={!selected} onClick={seeScene}>
          Sahneyi gör <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
