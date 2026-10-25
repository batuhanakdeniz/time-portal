import { yearToSlug } from './yearSlug'

/** /yil/1453 ya da /yil/1453/yer/34-beyoglu */
export function mapPath(year: number, placeSlug?: string): string {
  const base = `/yil/${yearToSlug(year)}`
  return placeSlug ? `${base}/yer/${placeSlug}` : base
}

/** /yil/1453/yer/34-beyoglu/sahne */
export function scenePath(year: number, placeSlug: string): string {
  return `${mapPath(year, placeSlug)}/sahne`
}

/** Girişte kanonik adrese yönlendirirken taşınan işaret (yönlendirme yeni bir `key` üretir). */
export interface EntryState {
  entry?: boolean
}

/**
 * Sayfa uygulamanın ilk girişi mi (derin bağlantı)? Öyleyse "←" `history.back()` yerine
 * üst rotaya `replace` eder, böylece kullanıcı siteden çıkmaz.
 */
export function isEntryPoint(location: { key: string; state: unknown }): boolean {
  if (location.key === 'default') return true
  const s = location.state as EntryState | null
  return !!s && typeof s === 'object' && s.entry === true
}
