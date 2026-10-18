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

const smoothstep = (t: number) => {
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
