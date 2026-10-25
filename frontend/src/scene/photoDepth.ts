/** Fotoğraf + derinlik (2.5B) görüntüleyicinin saf hesapları. Açılar derece cinsindendir. */

export interface PhotoView {
  /** Yatay dönüş, [-YAW_LIMIT, YAW_LIMIT]. Pozitif = kamera sağa geçer. */
  yaw: number
  /** Dikey dönüş, [-PITCH_LIMIT, PITCH_LIMIT]. Pozitif = kamera yukarı geçer. */
  pitch: number
  /** Yakınlaştırma çarpanı, [ZOOM_MIN, ZOOM_MAX]. */
  zoom: number
}

export const YAW_LIMIT = 15
export const PITCH_LIMIT = 8
export const ZOOM_MIN = 1
export const ZOOM_MAX = 2.5
export const ZOOM_DEFAULT = 1
/** Fare paralaksının her eksendeki en büyük katkısı (derece). */
export const PARALLAX_YAW = 3
export const PARALLAX_PITCH = 2
export const KEY_STEP = 2
export const KEY_ZOOM_STEP = 0.1
/** Tekerlek delta birimi başına yakınlaştırmanın üssel değişimi. */
export const WHEEL_ZOOM_RATE = 0.002
/** Sürükleme hassasiyeti: görüntü yüksekliği boyunca sürükleme kaç derece döndürür. */
export const DRAG_DEGREES_PER_HEIGHT = 30
/** En yakın (beyaz) noktanın düzlemden öne çıkma miktarı (dünya birimi; düzlem yüksekliği 2). */
export const DEPTH_SCALE = 0.45
/** Kenardan bu orana (genişlik/yükseklik başına) kadar içeride derinlik sönümlenir. */
export const EDGE_MARGIN = 0.08
export const GRID_DESKTOP_COLS = 192
export const GRID_MOBILE_COLS = 96

export const DEFAULT_PHOTO_VIEW: PhotoView = { yaw: 0, pitch: 0, zoom: ZOOM_DEFAULT }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const finite = (v: number) => (Number.isFinite(v) ? v : 0)

export function clampYaw(yaw: number): number {
  return clamp(finite(yaw), -YAW_LIMIT, YAW_LIMIT)
}
export function clampPitch(pitch: number): number {
  return clamp(finite(pitch), -PITCH_LIMIT, PITCH_LIMIT)
}
export function clampZoom(zoom: number): number {
  return Number.isNaN(zoom) ? ZOOM_DEFAULT : clamp(zoom, ZOOM_MIN, ZOOM_MAX)
}

export function normalizePhotoView(v: PhotoView): PhotoView {
  return { yaw: clampYaw(v.yaw), pitch: clampPitch(v.pitch), zoom: clampZoom(v.zoom) }
}

/** "Tut ve çek": sağa sürükleme sahneyi sağa çeker (kamera sola geçer), aşağı sürükleme kamerayı yukarı alır. */
export function applyPhotoDrag(view: PhotoView, dxPx: number, dyPx: number, viewportHeight: number): PhotoView {
  const k = DRAG_DEGREES_PER_HEIGHT / Math.max(viewportHeight, 1)
  return normalizePhotoView({ ...view, yaw: view.yaw - finite(dxPx) * k, pitch: view.pitch + finite(dyPx) * k })
}

/** Ctrl/⌘ + tekerlek: deltaY > 0 uzaklaşır. */
export function applyPhotoWheel(view: PhotoView, deltaY: number): PhotoView {
  return normalizePhotoView({ ...view, zoom: view.zoom * Math.exp(-finite(deltaY) * WHEEL_ZOOM_RATE) })
}

/** Çimdik: ratio = yeni parmak aralığı / eski aralık; >1 yakınlaştırır. */
export function applyPhotoPinch(view: PhotoView, ratio: number): PhotoView {
  if (!Number.isFinite(ratio) || ratio <= 0) return view
  return normalizePhotoView({ ...view, zoom: view.zoom * ratio })
}

export const PHOTO_HANDLED_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_']

export function applyPhotoKey(view: PhotoView, key: string): PhotoView {
  switch (key) {
    case 'ArrowLeft':
      return normalizePhotoView({ ...view, yaw: view.yaw - KEY_STEP })
    case 'ArrowRight':
      return normalizePhotoView({ ...view, yaw: view.yaw + KEY_STEP })
    case 'ArrowUp':
      return normalizePhotoView({ ...view, pitch: view.pitch + KEY_STEP })
    case 'ArrowDown':
      return normalizePhotoView({ ...view, pitch: view.pitch - KEY_STEP })
    case '+':
    case '=':
      return normalizePhotoView({ ...view, zoom: view.zoom + KEY_ZOOM_STEP })
    case '-':
    case '_':
      return normalizePhotoView({ ...view, zoom: view.zoom - KEY_ZOOM_STEP })
    default:
      return view
  }
}

/**
 * Sürükleme + fare paralaksı birleşimi; sonuç her zaman sınırların içindedir.
 * pointer: kapsayıcıya göre normalleştirilmiş fare konumu, [-1, 1] (sağ/yukarı pozitif).
 */
export function effectiveRotation(view: PhotoView, pointer: { x: number; y: number }): { yaw: number; pitch: number } {
  const px = clamp(finite(pointer.x), -1, 1)
  const py = clamp(finite(pointer.y), -1, 1)
  return {
    yaw: clampYaw(view.yaw + px * PARALLAX_YAW),
    pitch: clampPitch(view.pitch + py * PARALLAX_PITCH),
  }
}

/** Kameranın düzlem merkezi etrafındaki yörünge konumu (hedef orijin, düzlem z=0, kamera +z tarafında). */
export function orbitPosition(yawDeg: number, pitchDeg: number, distance: number): [number, number, number] {
  const rad = Math.PI / 180
  const yaw = clampYaw(yawDeg) * rad
  const pitch = clampPitch(pitchDeg) * rad
  return [
    distance * Math.sin(yaw) * Math.cos(pitch),
    distance * Math.sin(pitch),
    distance * Math.cos(yaw) * Math.cos(pitch),
  ]
}

/** Dikey FOV'a ve zoom'a göre düzlemin (yükseklik 2) kadraja sığdığı kamera uzaklığı. */
export function cameraDistance(fovDeg: number, zoom: number, planeHeight = 2): number {
  const half = (fovDeg * Math.PI) / 360
  return planeHeight / 2 / Math.tan(half) / clampZoom(zoom)
}

/** Sınır açılarında kenarın kadraja girmemesi için ek güvenlik payı (köşelerde yaw+pitch etkileşimi). */
export const OVERSCAN_MARGIN = 1.02

/**
 * Düzlem ölçeği (>= 1): en uç yaw/pitch'te (sürükleme sınırı; paralaks toplamı da effectiveRotation ile aynı
 * sınıra kenetlenir) kadrajın 4 köşesinden geçen ışınlar z=0 düzlemini vurur; düzlemin hepsini kaplaması için
 * gereken yarı boyut bütün uç açı kombinasyonları (yaw ve pitch birlikte, köşeler dahil) üzerinden alınır.
 * Bu bilinçli bir hafif kırpmadır. aspect: kadrajın (ve düzlemin) en/boy oranı; düzlem yüksekliği 2, zoom=1.
 */
export function overscanScale(fovDeg: number, aspect: number): number {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1.5
  const tv = Math.tan((fovDeg * Math.PI) / 360)
  const th = tv * a
  const dist = cameraDistance(fovDeg, 1)
  let need = 1
  for (const yaw of [-YAW_LIMIT, YAW_LIMIT]) {
    for (const pitch of [-PITCH_LIMIT, PITCH_LIMIT]) {
      const [px, py, pz] = orbitPosition(yaw, pitch, dist)
      const fl = Math.hypot(px, py, pz)
      const f = [-px / fl, -py / fl, -pz / fl]
      // right = f x up(0,1,0), normalize; up2 = right x f
      let rx = -f[2]
      let rz = f[0]
      const rl = Math.hypot(rx, rz)
      rx /= rl
      rz /= rl
      const ux = -rz * f[1]
      const uy = rz * f[0] - rx * f[2]
      const uz = rx * f[1]
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const dx = f[0] + sx * th * rx + sy * tv * ux
          const dy = f[1] + sy * tv * uy
          const dz = f[2] + sx * th * rz + sy * tv * uz
          if (dz >= 0) return 2 * a
          const t = -pz / dz
          need = Math.max(need, Math.abs(px + t * dx) / a, Math.abs(py + t * dy))
        }
      }
    }
  }
  return need * OVERSCAN_MARGIN
}

/** Paralaks yumuşatma: hedefe doğru kare süresinden bağımsız üssel yaklaşım. */
export function smoothToward(current: number, target: number, deltaSec: number, rate = 8): number {
  const k = 1 - Math.exp(-Math.max(0, finite(deltaSec)) * rate)
  const next = current + (target - current) * k
  return Math.abs(target - next) < 1e-4 ? target : next
}

const smoothstep =(t: number) => {
  const c = clamp(t, 0, 1)
  return c * c * (3 - 2 * c)
}

/**
 * Kenar sönümleme çarpanı [0,1]: kenarda 0, EDGE_MARGIN içeride 1 (smoothstep).
 * u, v: [0,1] düzlem koordinatları. Kenardaki köşeler düzlemde kalır, böylece görüntü kenarı yırtılmaz/açılmaz.
 */
export function edgeAttenuation(u: number, v: number, margin = EDGE_MARGIN): number {
  const m = Math.max(margin, 1e-6)
  const du = Math.min(u, 1 - u) / m
  const dv = Math.min(v, 1 - v) / m
  return smoothstep(du) * smoothstep(dv)
}

/** Cihaza göre ızgara çözünürlüğü (segment sayısı); hücreler kare kalacak şekilde satır sayısı en-boy oranından gelir. */
export function chooseGridSize(aspect: number, isMobile: boolean): { cols: number; rows: number } {
  const cols = isMobile ? GRID_MOBILE_COLS : GRID_DESKTOP_COLS
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1.5
  return { cols, rows: Math.max(1, Math.round(cols / a)) }
}

/**
 * Derinlik haritasından köşe ofsetleri. depth: (cols+1)*(rows+1) adet [0,255] gri değeri,
 * satır satır, üstten alta. Açık (255) = yakın = +z (kameraya doğru). Kenar sönümlemesi uygulanır.
 */
export function buildDisplacement(depth: ArrayLike<number>, cols: number, rows: number, scale = DEPTH_SCALE): Float32Array {
  const w = cols + 1
  const h = rows + 1
  const out = new Float32Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const idx = j * w + i
      const d = clamp(finite(depth[idx] ?? 0), 0, 255) / 255
      out[idx] = d * scale * edgeAttenuation(i / cols, j / rows)
    }
  }
  return out
}

/** Derinlik normalizasyonu için kırpma yüzdelikleri: uç %5'lik dilimler (gökyüzü gürültüsü, tek tük parlak pikseller) atılır. */
export const DEPTH_CLIP_LOW = 5
export const DEPTH_CLIP_HIGH = 95
/**
 * Komşu iki köşe arasındaki en büyük z farkı, hücre genişliği cinsinden (eğim sınırı). 1 = en dik yüzey 45°;
 * ±15° yaw'da bir köşe çifti ekranda en fazla sin(15°) ≈ 0,26 hücre ek uzunluk kazanır.
 */
export const MAX_DEPTH_SLOPE = 1
/** Normalizasyonda yüzdelik aralığının alt sınırı (gri düzeyi): neredeyse düz haritada gürültü tam aralığa yayılmaz. */
export const DEPTH_MIN_RANGE = 24

/**
 * Derinliği [low, high] yüzdelik aralığına kırpıp [0,255]'e yeniden yayar. Yüzdelikler 256 kutulu histogramdan
 * gelir (p. yüzdelik = sıralı dizide ⌊p·n/100⌋. eleman). Kazanç 255 / max(aralık, minRange) ile sınırlıdır:
 * aralığı minRange'den dar (neredeyse düz) haritada sonuç [0, 255·aralık/minRange] içinde kalır, düz harita 0 olur.
 */
export function normalizeDepth(
  depth: ArrayLike<number>,
  low = DEPTH_CLIP_LOW,
  high = DEPTH_CLIP_HIGH,
  minRange = DEPTH_MIN_RANGE,
): Float32Array {
  const n = depth.length
  const values = new Float32Array(n)
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) {
    const v = clamp(finite(depth[i] ?? 0), 0, 255)
    values[i] = v
    hist[Math.round(v)]++
  }
  if (n === 0) return values
  const percentile = (p: number) => {
    const target = Math.min(n - 1, Math.floor((clamp(p, 0, 100) / 100) * n))
    let seen = 0
    for (let b = 0; b < 256; b++) {
      seen += hist[b]
      if (seen > target) return b
    }
    return 255
  }
  const lo = percentile(Math.min(low, high))
  const hi = percentile(Math.max(low, high))
  const k = 255 / Math.max(hi - lo, Math.max(1, finite(minRange)))
  for (let i = 0; i < n; i++) values[i] = clamp((values[i] - lo) * k, 0, 255)
  return values
}

/**
 * Eğim sınırı: komşu (yatay/dikey) köşeler arasındaki z farkı en fazla maxStep, çapraz komşularda maxStep·√2 olur.
 * z'(p) = min_q (z(q) + maxStep·d(p,q)) — iki geçişli pah (chamfer) mesafesiyle aşındırma. Sonuç hiçbir köşeyi
 * yükseltmez (z' ≤ z), dolayısıyla kenarda 0 olan köşeler 0 kalır. İnce, öne çıkan nesneler (korkuluk çubuğu)
 * çevrelerindeki arka plan derinliğine iner; büyük nesneler iç bölgede derinliğini korur, sınırlarında ≤ 45° rampa
 * oluşur. Böylece süreksizlikte doku uzayan "lastik perde" üçgenleri oluşmaz.
 */
export function limitDepthSlope(z: ArrayLike<number>, cols: number, rows: number, maxStep: number): Float32Array {
  const w = cols + 1
  const h = rows + 1
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = finite(z[i] ?? 0)
  const s = Math.max(0, finite(maxStep))
  const d = s * Math.SQRT2
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const idx = j * w + i
      let v = out[idx]
      if (i > 0) v = Math.min(v, out[idx - 1] + s)
      if (j > 0) {
        v = Math.min(v, out[idx - w] + s)
        if (i > 0) v = Math.min(v, out[idx - w - 1] + d)
        if (i < w - 1) v = Math.min(v, out[idx - w + 1] + d)
      }
      out[idx] = v
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const idx = j * w + i
      let v = out[idx]
      if (i < w - 1) v = Math.min(v, out[idx + 1] + s)
      if (j < h - 1) {
        v = Math.min(v, out[idx + w] + s)
        if (i < w - 1) v = Math.min(v, out[idx + w + 1] + d)
        if (i > 0) v = Math.min(v, out[idx + w - 1] + d)
      }
      out[idx] = v
    }
  }
  return out
}

/**
 * Görüntüleyicinin kullandığı tam hat: 5–95 yüzdelik normalizasyonu → itme → eğim sınırı → kenar sönümleme çarpanı.
 * aspect: düzlemin en/boy oranı (düzlem 2·aspect × 2). Eğim sınırı hücre boyuna göre hesaplanır, böylece ızgara
 * çözünürlüğü ve görsel oranı ne olursa olsun bir köşe komşusundan en fazla ~1 hücre öne çıkabilir.
 * Sönümleme aşındırmadan SONRA uygulanır: önce uygulansaydı kenardaki 0 köşeler aşındırmanın kaynağı olur ve 45°
 * rampa kenar bandının (EDGE_MARGIN) ~3 katı içeri yayılırdı (zemin ve kenara yakın nesneler derinlik kaybederdi).
 * Bedeli: kenar bandında komşu farkı en fazla slope·hücre + scale·max|Δsönümleme| olur (yumuşak smoothstep rampası,
 * süreksizlik değil); bandın dışında sınır tam olarak slope·hücredir.
 */
export function buildDepthOffsets(
  depth: ArrayLike<number>,
  cols: number,
  rows: number,
  aspect: number,
  scale = DEPTH_SCALE,
  slope = MAX_DEPTH_SLOPE,
): Float32Array {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1.5
  const cell = Math.min((2 * a) / Math.max(cols, 1), 2 / Math.max(rows, 1))
  const normalized = normalizeDepth(depth)
  const w = cols + 1
  const h = rows + 1
  const raw = new Float32Array(w * h)
  for (let i = 0; i < raw.length; i++) raw[i] = ((normalized[i] ?? 0) / 255) * scale
  const out = limitDepthSlope(raw, cols, rows, slope * cell)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) out[j * w + i] *= edgeAttenuation(i / cols, j / rows)
  }
  return out
}
