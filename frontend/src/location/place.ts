// Yer seçimi tipi ve URL parçası (`:yer`) yardımcıları. Sözleşme: docs/FAZ3.md §1 ve §4.
// Bu dosya Node'dan da içe aktarılır (frontend/tools/build-geo.mjs); yalnızca silinebilir TS sözdizimi kullan.

export interface PlaceSelection {
  plate: string // "34"
  province: string // "İstanbul"
  district?: { slug: string; name: string; lat: number; lon: number }
  center: { lat: number; lon: number } // ilçe seçiliyse ilçe merkezi, değilse il merkezi
}

const TR_ASCII: Record<string, string> = {
  ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ş: 's', Ş: 's', ı: 'i', I: 'i', İ: 'i', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
}

/** ASCII slug: `Beyoğlu` → `beyoglu`, `Şebinkarahisar` → `sebinkarahisar`; boşluk/noktalama `-`. */
export function slugify(name: string): string {
  return name
    .replace(/[ğĞüÜşŞıIİöÖçÇ]/g, (c) => TR_ASCII[c])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // â, î, û gibi kalan aksanlar
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** `34` (yalnızca il) ya da `34-beyoglu` (il + ilçe). */
export function placeToSlug(p: PlaceSelection): string {
  return p.district ? `${p.plate}-${p.district.slug}` : p.plate
}

/** `34-beyoglu` → `{ plate: '34', district: 'beyoglu' }`; biçim bozuksa null. */
export function parsePlaceSlug(slug: string): { plate: string; district?: string } | null {
  const m = /^(\d{2})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/.exec(slug)
  if (!m) return null
  return m[2] ? { plate: m[1], district: m[2] } : { plate: m[1] }
}
