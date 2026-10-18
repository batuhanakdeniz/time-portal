// Türkiye sınır kutusu: [[batı, güney], [doğu, kuzey]] (MapLibre LngLatBoundsLike sırası)
export const TURKEY_BOUNDS: [[number, number], [number, number]] = [
  [25.6, 35.8],
  [44.9, 42.2],
]

export const TURKEY_ONLY_MESSAGE = "Şimdilik yalnızca Türkiye'deki konumlar destekleniyor."

// Kullanıcı kaydırırken kenarlar rahat görünsün diye kutunun genişletilmiş hali
const MARGIN = 4
export const TURKEY_MAX_BOUNDS: [[number, number], [number, number]] = [
  [TURKEY_BOUNDS[0][0] - MARGIN, TURKEY_BOUNDS[0][1] - MARGIN],
  [TURKEY_BOUNDS[1][0] + MARGIN, TURKEY_BOUNDS[1][1] + MARGIN],
]

export function isInTurkeyBounds(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  const [[west, south], [east, north]] = TURKEY_BOUNDS
  return lat >= south && lat <= north && lon >= west && lon <= east
}
