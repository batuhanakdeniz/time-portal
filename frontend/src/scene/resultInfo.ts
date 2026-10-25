import type { SceneAttribution, ScenePlace } from '../api/scenes'

/** "Beyoğlu, İstanbul"; ilçe "Merkez" ise "Hakkari Merkez". */
export function formatPlace(place: ScenePlace): string {
  return place.district === 'Merkez' ? `${place.province} Merkez` : `${place.district}, ${place.province}`
}

/** Yalnızca https: bağlantılara izin verir (javascript:, data: vb. düz metin kalır). */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname !== '' ? u.href : null
  } catch {
    return null
  }
}

export const MAPILLARY_URL = 'https://www.mapillary.com'

export function providerLabel(provider: SceneAttribution['provider']): { name: string; url: string | null } {
  switch (provider) {
    case 'mapillary':
      return { name: 'Mapillary', url: MAPILLARY_URL }
    case 'wikimedia-commons':
      return { name: 'Wikimedia Commons', url: null }
    case 'sample':
      return { name: 'Örnek görsel', url: null }
    default:
      return { name: provider, url: null }
  }
}
