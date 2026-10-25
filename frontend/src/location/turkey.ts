// Türkiye sınır kutusu: [[batı, güney], [doğu, kuzey]] (MapLibre LngLatBoundsLike sırası)
export const TURKEY_BOUNDS: [[number, number], [number, number]] = [
  [25.6, 35.8],
  [44.9, 42.2],
]

export const TURKEY_ONLY_MESSAGE = "Şimdilik yalnızca Türkiye'deki konumlar destekleniyor."

// Kaydırma payı asimetrik: maxBounds, harita kabının en/boy oranı kutununkinden küçükse
// zoom'u zorla artırır. Türkiye geniş (~19° boylam, ~6° enlem), kap ise dar/kısa olabilir
// (telefonda 320px yükseklik). Boylam payı küçük tutulur ki dar ekranda uçlar kesilmesin;
// enlem payı büyüktür çünkü kutu zaten yatay uzundur ve dikeyde boşluk yer kaplamaz.
const LNG_MARGIN = 2
const LAT_MARGIN = 6
export const TURKEY_MAX_BOUNDS: [[number, number], [number, number]] = [
  [TURKEY_BOUNDS[0][0] - LNG_MARGIN, TURKEY_BOUNDS[0][1] - LAT_MARGIN],
  [TURKEY_BOUNDS[1][0] + LNG_MARGIN, TURKEY_BOUNDS[1][1] + LAT_MARGIN],
]
