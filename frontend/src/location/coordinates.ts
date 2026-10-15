export interface Selection {
  latitude: number
  longitude: number
}

/** Boylamı -180..180 aralığına sarar (180 ve -180 olduğu gibi kalır). */
export function normalizeLongitude(lng: number): number {
  if (lng >= -180 && lng <= 180) return lng
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

export function clampLatitude(lat: number): number {
  return Math.min(90, Math.max(-90, lat))
}

function round4(n: number): number {
  const r = Math.round(n * 10000) / 10000
  return r === 0 ? 0 : r // -0 olmasın
}

export function toSelection(lat: number, lng: number): Selection {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Koordinatlar sonlu sayı olmalı')
  }
  return {
    latitude: round4(clampLatitude(lat)),
    longitude: round4(normalizeLongitude(lng)),
  }
}

export function formatCoordinates({ latitude, longitude }: Selection): string {
  const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude < 0 ? 'G' : 'K'}`
  const lng = `${Math.abs(longitude).toFixed(4)}° ${longitude < 0 ? 'B' : 'D'}`
  return `${lat}, ${lng}`
}
