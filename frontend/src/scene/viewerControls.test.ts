import { describe, expect, it } from 'vitest'
import {
  applyDrag,
  applyKey,
  applyPinch,
  applyWheel,
  clampFov,
  clampPitch,
  degreesPerPixel,
  DEFAULT_VIEW,
  FOV_DEFAULT,
  FOV_MAX,
  FOV_MIN,
  KEY_FOV_STEP,
  KEY_PITCH_STEP,
  KEY_YAW_STEP,
  PITCH_LIMIT,
  wrapYaw,
} from './viewerControls'

describe('wrapYaw', () => {
  it('360 -> 0, -10 -> 350, 370 -> 10', () => {
    expect(wrapYaw(360)).toBe(0)
    expect(wrapYaw(-10)).toBe(350)
    expect(wrapYaw(370)).toBe(10)
    expect(wrapYaw(-360)).toBe(0)
    expect(wrapYaw(725)).toBe(5)
  })
})

describe('pitch ve FOV sınırları', () => {
  it('pitch ±85° ile sınırlıdır', () => {
    expect(PITCH_LIMIT).toBe(85)
    expect(clampPitch(100)).toBe(85)
    expect(clampPitch(-100)).toBe(-85)
    expect(clampPitch(30)).toBe(30)
  })
  it('FOV 30–90 arasıdır, varsayılan 75', () => {
    expect(FOV_DEFAULT).toBe(75)
    expect(DEFAULT_VIEW).toEqual({ yaw: 0, pitch: 0, fov: 75 })
    expect(clampFov(10)).toBe(FOV_MIN)
    expect(clampFov(120)).toBe(FOV_MAX)
    expect(clampFov(60)).toBe(60)
  })
})

describe('sürükleme', () => {
  it('hassasiyet FOV ile orantılıdır', () => {
    expect(degreesPerPixel(60, 600)).toBeCloseTo(0.1)
    expect(degreesPerPixel(30, 600)).toBeCloseTo(degreesPerPixel(60, 600) / 2)
  })
  it('aynı piksel, yakınlaşınca daha az döner', () => {
    const wide = applyDrag({ yaw: 100, pitch: 0, fov: 90 }, -100, 0, 500)
    const tight = applyDrag({ yaw: 100, pitch: 0, fov: 30 }, -100, 0, 500)
    expect(wide.yaw - 100).toBeCloseTo(18)
    expect(tight.yaw - 100).toBeCloseTo(6)
  })
  it('sağa sürükleme yaw azaltır, aşağı sürükleme pitch artırır', () => {
    const v = applyDrag({ yaw: 50, pitch: 0, fov: 60 }, 10, 10, 600)
    expect(v.yaw).toBeCloseTo(49)
    expect(v.pitch).toBeCloseTo(1)
  })
  it('yaw sarar, pitch sınırda kalır', () => {
    expect(applyDrag({ yaw: 1, pitch: 0, fov: 60 }, 100, 0, 600).yaw).toBeCloseTo(351)
    expect(applyDrag({ yaw: 0, pitch: 80, fov: 90 }, 0, 10000, 600).pitch).toBe(85)
    expect(applyDrag({ yaw: 0, pitch: -80, fov: 90 }, 0, -10000, 600).pitch).toBe(-85)
  })
  it('sıfır yükseklikte bölme hatası vermez', () => {
    expect(Number.isFinite(applyDrag(DEFAULT_VIEW, 10, 10, 0).yaw)).toBe(true)
  })
})

describe('tekerlek ve çimdik', () => {
  it('tekerlek FOV değiştirir ve sınırlar', () => {
    expect(applyWheel(DEFAULT_VIEW, 100).fov).toBeCloseTo(80)
    expect(applyWheel(DEFAULT_VIEW, -100).fov).toBeCloseTo(70)
    expect(applyWheel(DEFAULT_VIEW, 1e6).fov).toBe(FOV_MAX)
    expect(applyWheel(DEFAULT_VIEW, -1e6).fov).toBe(FOV_MIN)
  })
  it('çimdik oranı yakınlaştırır / uzaklaştırır, geçersiz oranı yok sayar', () => {
    expect(applyPinch({ ...DEFAULT_VIEW, fov: 60 }, 2).fov).toBe(30)
    expect(applyPinch({ ...DEFAULT_VIEW, fov: 60 }, 0.5).fov).toBe(90)
    expect(applyPinch(DEFAULT_VIEW, 0)).toBe(DEFAULT_VIEW)
    expect(applyPinch(DEFAULT_VIEW, NaN)).toBe(DEFAULT_VIEW)
  })
})

describe('klavye', () => {
  it('oklar yaw/pitch adımı uygular', () => {
    expect(applyKey(DEFAULT_VIEW, 'ArrowRight').yaw).toBe(KEY_YAW_STEP)
    expect(applyKey(DEFAULT_VIEW, 'ArrowLeft').yaw).toBe(360 - KEY_YAW_STEP)
    expect(applyKey(DEFAULT_VIEW, 'ArrowUp').pitch).toBe(KEY_PITCH_STEP)
    expect(applyKey(DEFAULT_VIEW, 'ArrowDown').pitch).toBe(-KEY_PITCH_STEP)
  })
  it('pitch klavyeyle de sınırı aşmaz', () => {
    expect(applyKey({ yaw: 0, pitch: 85, fov: 75 }, 'ArrowUp').pitch).toBe(85)
  })
  it('+ yakınlaştırır, - uzaklaştırır, sınırlar korunur', () => {
    expect(applyKey(DEFAULT_VIEW, '+').fov).toBe(FOV_DEFAULT - KEY_FOV_STEP)
    expect(applyKey(DEFAULT_VIEW, '-').fov).toBe(FOV_DEFAULT + KEY_FOV_STEP)
    expect(applyKey({ ...DEFAULT_VIEW, fov: 30 }, '+').fov).toBe(30)
    expect(applyKey({ ...DEFAULT_VIEW, fov: 90 }, '-').fov).toBe(90)
  })
  it('bilinmeyen tuş görünümü değiştirmez', () => {
    expect(applyKey(DEFAULT_VIEW, 'a')).toBe(DEFAULT_VIEW)
  })
})
