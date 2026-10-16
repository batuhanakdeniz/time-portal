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
/** Tekerlek delta birimi başına FOV değişimi (derece). */
export const WHEEL_FOV_PER_UNIT = 0.05

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

/** Tekerlek: deltaY > 0 uzaklaşır (FOV artar). */
export function applyWheel(view: ViewState, deltaY: number): ViewState {
  return normalizeView({ ...view, fov: view.fov + deltaY * WHEEL_FOV_PER_UNIT })
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
