import type { PlaceSelection } from '../location/place'
import type { DistrictProps, PlacesData } from '../location/places'

const EARTH_RADIUS_KM = 6371

/** Büyük daire uzaklığı (km). */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Bu uzaklıktan yakın ilçe merkezi aynı nokta sayılır (il merkezi çoğu zaman merkez ilçenin merkeziyle aynıdır);
 * aynı noktayı önermek aynı "görsel yok" sonucunu verir.
 */
export const SAME_POINT_KM = 0.5

/**
 * "Görsel bulunamadı" için öneriler: seçilen yerin merkezine en yakın `count` ilçe.
 * Aynı il öncelikli değildir, yalnızca uzaklığa bakılır. Seçili ilçe ve aynı noktadaki ilçe dışarıda kalır.
 */
export function nearestDistricts(data: PlacesData, from: PlaceSelection, count = 3): DistrictProps[] {
  const selfKey = from.district ? `${from.plate}-${from.district.slug}` : null
  return data.districts.features
    .map((f) => f.properties)
    .filter((d) => d.key !== selfKey)
    .map((d) => ({ d, km: haversineKm(from.center, { lat: d.lat, lon: d.lon }) }))
    .filter((x) => x.km >= SAME_POINT_KM)
    .sort((a, b) => a.km - b.km || a.d.key.localeCompare(b.d.key))
    .slice(0, count)
    .map((x) => x.d)
}
