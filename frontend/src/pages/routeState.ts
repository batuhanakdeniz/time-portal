import type { Selection } from '../location/coordinates'
import type { EntryState } from '../routing/paths'

/** `location.state` içinde taşınanlar. Geçmişten (history.state) gelir; güvenilmez, her alan denetlenir. */
export interface RouteState extends EntryState {
  /** Yönlendirmeyle gelen kullanıcı mesajı (düz metin). */
  notice?: string
  /** Haritada seçilen nokta. #63'te `PlaceSelection` ve `:yer` çözümlemesiyle değişecek. */
  selection?: Selection
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function readRouteState(raw: unknown): RouteState {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: RouteState = {}
  if (typeof r.notice === 'string' && r.notice !== '') out.notice = r.notice
  if (r.entry === true) out.entry = true
  const s = r.selection as Record<string, unknown> | null | undefined
  if (s && typeof s === 'object' && isFiniteNumber(s.latitude) && isFiniteNumber(s.longitude)) {
    out.selection = { latitude: s.latitude, longitude: s.longitude }
  }
  return out
}

export const INVALID_YEAR_NOTICE = 'Bu yıl açılamadı. Yıl 0 yoktur; MÖ 100.000 ile 100.000 arasında bir yıl seç.'
export const INVALID_PLACE_NOTICE = 'Bu yer bağlantısı geçersiz. Haritadan bir yer seç.'
export const UNRESOLVED_LINK_MESSAGE = 'Bu bağlantıdaki yer henüz açılamıyor. Haritadan bir yer seç.'
