export interface ParsedPlace {
  /** İki haneli plaka kodu: "34". */
  plate: string
  /** İlçe slug'ı (ASCII, il içinde benzersiz): "beyoglu". */
  district?: string
}

const PLACE_SLUG = /^(\d{2})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/

/**
 * `:yer` parçasını ayrıştırır: "34" → {plate:"34"}, "34-beyoglu" → {plate:"34", district:"beyoglu"}.
 * Yalnızca biçimi denetler; ilin/ilçenin var olup olmadığını veri yükleyen katman (findBySlug, #59) söyler.
 */
export function parsePlaceSlug(slug: string | undefined): ParsedPlace | null {
  if (slug === undefined) return null
  const m = PLACE_SLUG.exec(slug)
  if (!m) return null
  return m[2] ? { plate: m[1], district: m[2] } : { plate: m[1] }
}
