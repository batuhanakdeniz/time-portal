import { describe, expect, it } from 'vitest'
import {
  applyPhotoDrag,
  applyPhotoKey,
  applyPhotoPinch,
  applyPhotoWheel,
  buildDisplacement,
  cameraDistance,
  chooseGridSize,
  DEFAULT_PHOTO_VIEW,
  DEPTH_SCALE,
  edgeAttenuation,
  effectiveRotation,
  GRID_DESKTOP_COLS,
  GRID_MOBILE_COLS,
  orbitPosition,
  PARALLAX_PITCH,
  PARALLAX_YAW,
  PHOTO_HANDLED_KEYS,
  PITCH_LIMIT,
  YAW_LIMIT,
  ZOOM_MAX,
  ZOOM_MIN,
  type PhotoView,
} from './photoDepth'

describe('dönüş sınırları', () => {
  it('sürükleme yatay ±15°, dikey ±8° sınırını asla aşmaz', () => {
    let v: PhotoView = DEFAULT_PHOTO_VIEW
    v = applyPhotoDrag(v, -100000, 100000, 500)
    expect(v.yaw).toBe(YAW_LIMIT)
    expect(v.pitch).toBe(PITCH_LIMIT)
    v = applyPhotoDrag(v, 200000, -200000, 500)
    expect(v.yaw).toBe(-YAW_LIMIT)
    expect(v.pitch).toBe(-PITCH_LIMIT)
  })

  it('sağa sürükleme yaw azaltır, aşağı sürükleme pitch artırır', () => {
    const v = applyPhotoDrag(DEFAULT_PHOTO_VIEW, 10, 10, 300)
    expect(v.yaw).toBeLessThan(0)
    expect(v.pitch).toBeGreaterThan(0)
  })

  it('NaN/Infinity girdileri sınırların içinde kalır', () => {
    const v = applyPhotoDrag(DEFAULT_PHOTO_VIEW, NaN, Infinity, 0)
    expect(Math.abs(v.yaw)).toBeLessThanOrEqual(YAW_LIMIT)
    expect(Math.abs(v.pitch)).toBeLessThanOrEqual(PITCH_LIMIT)
  })

  it('klavye sınıra dayanır', () => {
    let v: PhotoView = DEFAULT_PHOTO_VIEW
    for (let i = 0; i < 50; i++) v = applyPhotoKey(v, 'ArrowRight')
    for (let i = 0; i < 50; i++) v = applyPhotoKey(v, 'ArrowUp')
    expect(v.yaw).toBe(YAW_LIMIT)
    expect(v.pitch).toBe(PITCH_LIMIT)
    expect(applyPhotoKey(v, 'x')).toBe(v)
    expect(PHOTO_HANDLED_KEYS).toContain('ArrowLeft')
  })

  it('paralaks sürüklemeyle birleşse bile sınır aşılmaz', () => {
    const edge: PhotoView = { yaw: YAW_LIMIT, pitch: PITCH_LIMIT, zoom: 1 }
    const r = effectiveRotation(edge, { x: 1, y: 1 })
    expect(r.yaw).toBe(YAW_LIMIT)
    expect(r.pitch).toBe(PITCH_LIMIT)
    const r2 = effectiveRotation(edge, { x: 99, y: -99 })
    expect(r2.yaw).toBeLessThanOrEqual(YAW_LIMIT)
    expect(r2.pitch).toBeGreaterThanOrEqual(-PITCH_LIMIT)
  })

  it('paralaks ortada fare konumuyla orantılıdır', () => {
    const r = effectiveRotation(DEFAULT_PHOTO_VIEW, { x: 0.5, y: -1 })
    expect(r.yaw).toBeCloseTo(0.5 * PARALLAX_YAW)
    expect(r.pitch).toBeCloseTo(-PARALLAX_PITCH)
  })
})

describe('yakınlaştırma', () => {
  it('tekerlek, çimdik ve tuşlar [ZOOM_MIN, ZOOM_MAX] içinde kalır', () => {
    expect(applyPhotoWheel(DEFAULT_PHOTO_VIEW, -1e6).zoom).toBe(ZOOM_MAX)
    expect(applyPhotoWheel(DEFAULT_PHOTO_VIEW, 1e6).zoom).toBe(ZOOM_MIN)
    expect(applyPhotoPinch(DEFAULT_PHOTO_VIEW, 100).zoom).toBe(ZOOM_MAX)
    expect(applyPhotoPinch(DEFAULT_PHOTO_VIEW, 0.001).zoom).toBe(ZOOM_MIN)
    expect(applyPhotoKey(DEFAULT_PHOTO_VIEW, '-').zoom).toBe(ZOOM_MIN)
    expect(applyPhotoKey(DEFAULT_PHOTO_VIEW, '+').zoom).toBeGreaterThan(1)
  })

  it('geçersiz çimdik oranı görünümü değiştirmez', () => {
    expect(applyPhotoPinch(DEFAULT_PHOTO_VIEW, 0)).toBe(DEFAULT_PHOTO_VIEW)
    expect(applyPhotoPinch(DEFAULT_PHOTO_VIEW, NaN)).toBe(DEFAULT_PHOTO_VIEW)
  })

  it('negatif deltaY yakınlaştırır', () => {
    expect(applyPhotoWheel(DEFAULT_PHOTO_VIEW, -100).zoom).toBeGreaterThan(1)
  })

  it('zoom arttıkça kamera yaklaşır', () => {
    expect(cameraDistance(45, 2)).toBeCloseTo(cameraDistance(45, 1) / 2)
  })
})

describe('yörünge', () => {
  it('sıfır dönüşte kamera +z ekseninde, uzaklık korunur', () => {
    expect(orbitPosition(0, 0, 5)).toEqual([0, 0, 5])
    const [x, y, z] = orbitPosition(15, 8, 5)
    expect(Math.hypot(x, y, z)).toBeCloseTo(5)
    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0)
  })

  it('sınır dışı açıları sınırlar', () => {
    expect(orbitPosition(90, 90, 5)).toEqual(orbitPosition(YAW_LIMIT, PITCH_LIMIT, 5))
  })
})

describe('kenar sönümleme', () => {
  it('kenarda 0, iç bölgede 1', () => {
    expect(edgeAttenuation(0, 0.5)).toBe(0)
    expect(edgeAttenuation(1, 0.5)).toBe(0)
    expect(edgeAttenuation(0.5, 0)).toBe(0)
    expect(edgeAttenuation(0.5, 1)).toBe(0)
    expect(edgeAttenuation(0.5, 0.5)).toBe(1)
  })

  it('kenardan içeriye monoton artar ve simetriktir', () => {
    let prev = -1
    for (let u = 0; u <= 0.1; u += 0.01) {
      const a = edgeAttenuation(u, 0.5)
      expect(a).toBeGreaterThanOrEqual(prev)
      prev = a
    }
    expect(edgeAttenuation(0.03, 0.4)).toBeCloseTo(edgeAttenuation(0.97, 0.6))
  })

  it('her zaman [0,1] aralığında', () => {
    for (const [u, v] of [
      [-1, 2],
      [0.01, 0.01],
      [0.5, 0.99],
    ]) {
      const a = edgeAttenuation(u, v)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(1)
    }
  })
})

describe('ızgara çözünürlüğü', () => {
  it('mobilde masaüstünden düşüktür', () => {
    expect(chooseGridSize(1.5, true).cols).toBe(GRID_MOBILE_COLS)
    expect(chooseGridSize(1.5, false).cols).toBe(GRID_DESKTOP_COLS)
    expect(GRID_MOBILE_COLS).toBeLessThan(GRID_DESKTOP_COLS)
  })

  it('satır sayısı en-boy oranını izler, geçersiz orana dayanıklı', () => {
    expect(chooseGridSize(2, false).rows).toBe(GRID_DESKTOP_COLS / 2)
    expect(chooseGridSize(0, true).rows).toBeGreaterThanOrEqual(1)
    expect(chooseGridSize(NaN, true).rows).toBeGreaterThanOrEqual(1)
  })
})

describe('buildDisplacement', () => {
  const cols = 20
  const rows = 10
  const flat = (value: number) => new Array((cols + 1) * (rows + 1)).fill(value)

  it('açık = yakın: beyaz iç nokta DEPTH_SCALE kadar öne çıkar, siyah çıkmaz', () => {
    const white = buildDisplacement(flat(255), cols, rows)
    const black = buildDisplacement(flat(0), cols, rows)
    const mid = 5 * (cols + 1) + 10
    expect(white[mid]).toBeCloseTo(DEPTH_SCALE)
    expect(black[mid]).toBe(0)
  })

  it('kenar köşeleri derinlik ne olursa olsun düzlemde kalır', () => {
    const out = buildDisplacement(flat(255), cols, rows)
    for (let i = 0; i <= cols; i++) {
      expect(out[i]).toBe(0)
      expect(out[rows * (cols + 1) + i]).toBe(0)
    }
    for (let j = 0; j <= rows; j++) {
      expect(out[j * (cols + 1)]).toBe(0)
      expect(out[j * (cols + 1) + cols]).toBe(0)
    }
  })

  it('eksik/bozuk değerler 0 ile 255 arasında sınırlanır', () => {
    const out = buildDisplacement([999, NaN], cols, rows)
    expect(out.every((x) => x >= 0 && x <= DEPTH_SCALE)).toBe(true)
  })
})
