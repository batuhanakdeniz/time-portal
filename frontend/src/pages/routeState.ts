import type { EntryState } from '../routing/paths'

/**
 * `location.state` içinde taşınanlar. Geçmişten (history.state) gelir; güvenilmez, her alan denetlenir.
 * Yer seçimi state'te taşınmaz: tek kaynağı URL'deki `:yer` parçasıdır (`findBySlug`).
 */
export interface RouteState extends EntryState {
  /** Yönlendirmeyle gelen kullanıcı mesajı (düz metin). */
  notice?: string
}

export function readRouteState(raw: unknown): RouteState {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: RouteState = {}
  if (typeof r.notice === 'string' && r.notice !== '') out.notice = r.notice
  if (r.entry === true) out.entry = true
  return out
}

export const INVALID_YEAR_NOTICE = 'Bu yıl açılamadı. Yıl 0 yoktur; MÖ 100.000 ile 100.000 arasında bir yıl seç.'
export const INVALID_PLACE_NOTICE = 'Bu yer bağlantısı geçersiz. Haritadan bir yer seç.'
