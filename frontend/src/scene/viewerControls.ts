/** 360° görüntüleyicinin saf kontrol mantığı. Açılar derece cinsindendir. */

export interface ViewState {
  /** Yatay bakış yönü, [0, 360). Artarken sağa döner. */
  yaw: number
  /** Dikey bakış, [-PITCH_LIMIT, PITCH_LIMIT]. Pozitif = yukarı. */
  pitch: number
  /** Dikey görüş alanı (yakınlaştırma), [FOV_MIN, FOV_MAX]. */
  fov: number
}

export const PITCH_LIMIT = 85
export const FOV_MIN = 30
export const FOV_MAX = 90
export const FOV_DEFAULT = 75
export const KEY_YAW_STEP = 5
export const KEY_PITCH_STEP = 5
export const KEY_FOV_STEP = 5
/** Tekerlek delta birimi başına FOV'un üssel değişimi (fare tekerleği ~100/çentik, trackpad çimdiği ~1–20/olay). */
export const WHEEL_ZOOM_RATE = 0.003
/**
 * İlk bakış panoramanın ortasına (u=0.5) baksın diye yaw'a eklenen sabit ofset.
 * İçe dönük küre x'te aynalandığı için yaw=0 (kamera -z) dokunun u=0.75'ine bakar;
 * -90° ofsetle kamera -x'e, yani u=0.5'e bakar. Sağa dönünce (yaw artınca) u artar.
 */
export const YAW_OFFSET = -90
export const MOBILE_MAX_TEXTURE_WIDTH = 4096
export const DESKTOP_MAX_TEXTURE_WIDTH = 8192

export const DEFAULT_VIEW: ViewState = { yaw: 0, pitch: 0, fov: FOV_DEFAULT }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function wrapYaw(yaw: number): number {
  const wrapped = ((yaw % 360) + 360) % 360
  return wrapped === 0 ? 0 : wrapped // -0 olmasın
}

export function clampPitch(pitch: number): number {
  return clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT)
}

export function clampFov(fov: number): number {
  return clamp(fov, FOV_MIN, FOV_MAX)
}

export function normalizeView(v: ViewState): ViewState {
  return { yaw: wrapYaw(v.yaw), pitch: clampPitch(v.pitch), fov: clampFov(v.fov) }
}

/** Sürükleme hassasiyeti: piksel başına derece. Yakınlaşınca (küçük FOV) daha hassas. */
export function degreesPerPixel(fov: number, viewportHeight: number): number {
  return clampFov(fov) / Math.max(viewportHeight, 1)
}

/** "Tut ve çek": sağa sürükleme sahneyi sağa çeker (bakış sola döner), aşağı sürükleme yukarı bakar. */
export function applyDrag(view: ViewState, dxPx: number, dyPx: number, viewportHeight: number): ViewState {
  const k = degreesPerPixel(view.fov, viewportHeight)
  return normalizeView({ ...view, yaw: view.yaw - dxPx * k, pitch: view.pitch + dyPx * k })
}

/** Tekerlek: deltaY > 0 uzaklaşır (FOV artar). Üssel: küçük trackpad deltaları da akıcı çalışır. */
export function applyWheel(view: ViewState, deltaY: number): ViewState {
  return normalizeView({ ...view, fov: view.fov * Math.exp(deltaY * WHEEL_ZOOM_RATE) })
}

/** Görünümden kamera dönüşü (radyan, Euler sırası 'YXZ'). */
export function cameraRotation(view: ViewState): { x: number; y: number } {
  const rad = Math.PI / 180
  return { x: view.pitch * rad, y: -(view.yaw + YAW_OFFSET) * rad }
}

/** Kameranın baktığı yatay doku koordinatı u [0,1). SphereGeometry(-1,1,1 ölçekli) için: x=cosφ·sinθ, z=sinφ·sinθ, u=φ/2π. */
export function horizontalTextureU(view: ViewState): number {
  const { y } = cameraRotation(view)
  const x = -Math.sin(y)
  const z = -Math.cos(y)
  const u = Math.atan2(z, x) / (2 * Math.PI)
  const wrapped = ((u % 1) + 1) % 1
  return Math.round(wrapped * 1e9) / 1e9 % 1
}

/** Panorama genişliğini (2:1) cihaza göre sınırlar: mobilde ≤4096, masaüstünde ≤min(GPU, 8192). */
export function chooseTextureWidth(imageWidth: number, gpuMaxTextureSize: number, isMobile: boolean): number {
  const cap = Math.min(gpuMaxTextureSize, isMobile ? MOBILE_MAX_TEXTURE_WIDTH : DESKTOP_MAX_TEXTURE_WIDTH)
  return Math.max(1, Math.min(Math.floor(imageWidth), cap))
}

/** Çimdik: ratio = yeni parmak aralığı / eski aralık; >1 yakınlaştırır. */
export function applyPinch(view: ViewState, ratio: number): ViewState {
  if (!Number.isFinite(ratio) || ratio <= 0) return view
  return normalizeView({ ...view, fov: view.fov / ratio })
}

export function applyKey(view: ViewState, key: string): ViewState {
  switch (key) {
    case 'ArrowLeft':
      return normalizeView({ ...view, yaw: view.yaw - KEY_YAW_STEP })
    case 'ArrowRight':
      return normalizeView({ ...view, yaw: view.yaw + KEY_YAW_STEP })
    case 'ArrowUp':
      return normalizeView({ ...view, pitch: view.pitch + KEY_PITCH_STEP })
    case 'ArrowDown':
      return normalizeView({ ...view, pitch: view.pitch - KEY_PITCH_STEP })
    case '+':
    case '=':
      return normalizeView({ ...view, fov: view.fov - KEY_FOV_STEP })
    case '-':
    case '_':
      return normalizeView({ ...view, fov: view.fov + KEY_FOV_STEP })
    default:
      return view
  }
}

export const HANDLED_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_']
