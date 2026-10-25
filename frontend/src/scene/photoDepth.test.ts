import { describe, expect, it } from 'vitest'
import {
  applyPhotoDrag,
  applyPhotoKey,
  applyPhotoPinch,
  applyPhotoWheel,
  buildDepthOffsets,
  buildDisplacement,
  cameraDistance,
  chooseGridSize,
  DEFAULT_PHOTO_VIEW,
  DEPTH_CLIP_HIGH,
  DEPTH_CLIP_LOW,
  DEPTH_SCALE,
  edgeAttenuation,
  effectiveRotation,
  GRID_DESKTOP_COLS,
  GRID_MOBILE_COLS,
  limitDepthSlope,
  MAX_DEPTH_SLOPE,
  normalizeDepth,
  orbitPosition,
  overscanScale,
  smoothToward,
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

describe('taşma payı (overscan)', () => {
  const FOV = 45
  type V3 = [number, number, number]
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const norm = (a: V3): V3 => {
    const l = Math.hypot(...a)
    return [a[0] / l, a[1] / l, a[2] / l]
  }

  /**
   * Kadrajın 4 köşesinden geçen ışınların z=0 düzlemini vurduğu noktalar. Düzlem kadrajı tamamen
   * kaplıyorsa hepsi [-w,w]x[-h,h] içindedir (dışbükey olduğundan köşeler yeterli).
   */
  function frameCornerHits(yaw: number, pitch: number, aspect: number): [number, number][] {
    const tv = Math.tan((FOV * Math.PI) / 360)
    const th = tv * aspect
    const pos = orbitPosition(yaw, pitch, cameraDistance(FOV, 1))
    const f = norm([-pos[0], -pos[1], -pos[2]])
    const right = norm(cross(f, [0, 1, 0]))
    const up = cross(right, f)
    const hits: [number, number][] = []
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const d: V3 = [
          f[0] + sx * th * right[0] + sy * tv * up[0],
          f[1] + sx * th * right[1] + sy * tv * up[1],
          f[2] + sx * th * right[2] + sy * tv * up[2],
        ]
        const t = -pos[2] / d[2]
        hits.push([pos[0] + t * d[0], pos[1] + t * d[1]])
      }
    }
    return hits
  }

  const covers = (hits: [number, number][], aspect: number, s: number) =>
    hits.every(([x, y]) => Math.abs(x) <= s * aspect && Math.abs(y) <= s)

  it('sürükleme sınırı + paralaks birleşiminde, köşe kombinasyonlarında dahi düzlem kadrajı tamamen kaplar', () => {
    for (const aspect of [1.0, 1.5, 2.4]) {
      const s = overscanScale(FOV, aspect)
      for (const dy of [-YAW_LIMIT, 0, YAW_LIMIT]) {
        for (const dp of [-PITCH_LIMIT, 0, PITCH_LIMIT]) {
          for (const px of [-1, 0, 1]) {
            for (const py of [-1, 0, 1]) {
              const r = effectiveRotation({ yaw: dy, pitch: dp, zoom: 1 }, { x: px, y: py })
              expect(covers(frameCornerHits(r.yaw, r.pitch, aspect), aspect, s)).toBe(true)
            }
          }
        }
      }
    }
  })

  it('ölçek 1 olsaydı köşede kadraj düzlemin dışına taşardı (ölçek gerekli)', () => {
    const hits = frameCornerHits(YAW_LIMIT, PITCH_LIMIT, 1.5)
    expect(covers(hits, 1.5, 1)).toBe(false)
    expect(overscanScale(FOV, 1.5)).toBeGreaterThan(1)
  })

  it('ölçek makul kalır ve geçersiz orana dayanıklıdır', () => {
    expect(overscanScale(FOV, 1.5)).toBeLessThan(1.5)
    expect(overscanScale(FOV, NaN)).toBeGreaterThan(1)
  })
})

describe('paralaks yumuşatma', () => {
  it('hedefe yaklaşır, aşmaz, büyük adımda hedefe oturur', () => {
    const a = smoothToward(0, 1, 0.016)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(1)
    expect(smoothToward(0, 1, 10)).toBe(1)
    expect(smoothToward(1, 1, 0.016)).toBe(1)
    expect(smoothToward(0.5, -1, -5)).toBe(0.5)
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

/** Komşu köşe farklarının en büyüğü: yatay/dikey ve PlaneGeometry'nin çaprazı (i,j+1)-(i+1,j) dahil. */
function maxNeighborDiff(z: ArrayLike<number>, cols: number, rows: number): { axis: number; diag: number } {
  const w = cols + 1
  let axis = 0
  let diag = 0
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const idx = j * w + i
      if (i < cols) axis = Math.max(axis, Math.abs(z[idx + 1] - z[idx]))
      if (j < rows) axis = Math.max(axis, Math.abs(z[idx + w] - z[idx]))
      if (i < cols && j < rows) {
        diag = Math.max(diag, Math.abs(z[idx + w + 1] - z[idx]), Math.abs(z[idx + w] - z[idx + 1]))
      }
    }
  }
  return { axis, diag }
}

/** Belirlenimci sözde rastgele sayı üreteci (testler tekrarlanabilir kalsın). */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** Korkuluk benzeri derinlik: uzak arka plan (10), her 3 sütunda bir 1 sütun genişliğinde yakın çubuk (200). */
function railing(cols: number, rows: number): number[] {
  const out: number[] = []
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) out.push(i % 3 === 0 ? 200 : 10)
  return out
}

describe('normalizeDepth (5–95 yüzdelik kırpma)', () => {
  it('varsayılan kırpma aralığı 5–95', () => {
    expect(DEPTH_CLIP_LOW).toBe(5)
    expect(DEPTH_CLIP_HIGH).toBe(95)
  })

  it('uç %5 dilimleri kırpar, kalan aralığı [0,255]e yayar', () => {
    const values: number[] = []
    for (let v = 100; v < 150; v++) for (let k = 0; k < 20; k++) values.push(v)
    for (let k = 0; k < 10; k++) values.push(0, 255) // ~%1 aykırı değer her iki uçta
    const out = normalizeDepth(values)
    expect(out[0]).toBe(0) // 100 = p5 → 0
    expect(out[values.indexOf(149)]).toBe(255) // 149 = p95 → 255
    expect(out[values.indexOf(0)]).toBe(0)
    expect(out[values.indexOf(255)]).toBe(255)
    expect(out[values.indexOf(125)]).toBeGreaterThan(100)
    expect(out[values.indexOf(125)]).toBeLessThan(155)
  })

  it('sırayı korur (monoton) ve her zaman [0,255] içinde kalır', () => {
    const r = rng(7)
    const values = Array.from({ length: 500 }, () => Math.floor(r() * 256))
    const out = normalizeDepth(values)
    const order = values.map((v, i) => [v, out[i]] as const).sort((a, b) => a[0] - b[0])
    for (let i = 1; i < order.length; i++) expect(order[i][1]).toBeGreaterThanOrEqual(order[i - 1][1])
    expect(out.every((x) => x >= 0 && x <= 255)).toBe(true)
  })

  it('düz harita (aralık yok) ve bozuk değerler güvenle işlenir', () => {
    expect(Array.from(normalizeDepth([200, 200, 200]))).toEqual([200, 200, 200])
    const out = normalizeDepth([NaN, Infinity, -5, 999, 128])
    expect(out.every((x) => Number.isFinite(x) && x >= 0 && x <= 255)).toBe(true)
    expect(normalizeDepth([]).length).toBe(0)
  })
})

describe('limitDepthSlope (eğim sınırı)', () => {
  it('tek sivri köşe (ince nesne) komşusundan en fazla bir adım önde kalır', () => {
    const cols = 10
    const rows = 10
    const z = new Array((cols + 1) * (rows + 1)).fill(0)
    const mid = 5 * (cols + 1) + 5
    z[mid] = 10
    const out = limitDepthSlope(z, cols, rows, 1)
    expect(out[mid]).toBe(1)
    expect(maxNeighborDiff(out, cols, rows).axis).toBeLessThanOrEqual(1)
  })

  it('rastgele alanda komşu farkı adımı, çapraz fark adım·√2yi aşmaz; hiçbir köşe yükselmez', () => {
    const cols = 40
    const rows = 30
    const r = rng(42)
    const z = Array.from({ length: (cols + 1) * (rows + 1) }, () => r() * 0.45)
    const step = 0.01
    const out = limitDepthSlope(z, cols, rows, step)
    const d = maxNeighborDiff(out, cols, rows)
    expect(d.axis).toBeLessThanOrEqual(step + 1e-6)
    expect(d.diag).toBeLessThanOrEqual(step * Math.SQRT2 + 1e-6)
    for (let i = 0; i < z.length; i++) expect(out[i]).toBeLessThanOrEqual(z[i] + 1e-7)
  })

  it('büyük nesnenin iç bölgesi derinliğini korur, sınırında rampa oluşur', () => {
    const cols = 30
    const rows = 30
    const w = cols + 1
    const z = new Array(w * w).fill(0)
    for (let j = 5; j <= 25; j++) for (let i = 5; i <= 25; i++) z[j * w + i] = 4
    const out = limitDepthSlope(z, cols, rows, 1)
    expect(out[15 * w + 15]).toBe(4)
    expect(out[15 * w + 5]).toBe(1) // dış sınır: 0 + 1 adım
    expect(out[15 * w + 6]).toBe(2)
    expect(out[15 * w + 8]).toBe(4)
  })

  it('kenarda 0 olan köşeler 0 kalır; negatif/bozuk adım düzleştirir ama çökmez', () => {
    const cols = 6
    const rows = 4
    const z = buildDisplacement(new Array(35).fill(255), cols, rows)
    const out = limitDepthSlope(z, cols, rows, 0.05)
    for (let i = 0; i <= cols; i++) expect(out[i]).toBe(0)
    expect(limitDepthSlope(z, cols, rows, NaN).every((x) => x === 0)).toBe(true)
    expect(limitDepthSlope(z, cols, rows, -1).every((x) => x === 0)).toBe(true)
  })
})

describe('buildDepthOffsets (görüntüleyici hattı)', () => {
  it('varsayılan eğim sınırı 1 hücre', () => {
    expect(MAX_DEPTH_SLOPE).toBe(1)
  })

  it('korkuluk: önce komşu z farkı 10 hücreden büyük, sonra en fazla 1 hücre; ±15° yawda uzama ≤ sin(15°) hücre', () => {
    const aspect = 4 / 3
    const { cols, rows } = chooseGridSize(aspect, false)
    const cell = Math.min((2 * aspect) / cols, 2 / rows)
    const depth = railing(cols, rows)
    const before = maxNeighborDiff(buildDisplacement(depth, cols, rows), cols, rows).axis / cell
    const after = maxNeighborDiff(buildDepthOffsets(depth, cols, rows, aspect), cols, rows)
    expect(before).toBeGreaterThan(10)
    expect(after.axis / cell).toBeLessThanOrEqual(1 + 1e-4)
    expect(after.diag / cell).toBeLessThanOrEqual(Math.SQRT2 + 1e-4)
    const stretchCells = (after.axis * Math.sin((YAW_LIMIT * Math.PI) / 180)) / cell
    expect(stretchCells).toBeLessThan(0.27)
  })

  it('eğim sınırı en-boy oranı ve ızgaraya (mobil/masaüstü) göre ölçeklenir', () => {
    for (const aspect of [1, 4 / 3, 16 / 9, 2]) {
      for (const mobile of [false, true]) {
        const { cols, rows } = chooseGridSize(aspect, mobile)
        const cell = Math.min((2 * aspect) / cols, 2 / rows)
        const out = buildDepthOffsets(railing(cols, rows), cols, rows, aspect)
        expect(maxNeighborDiff(out, cols, rows).axis).toBeLessThanOrEqual(cell * MAX_DEPTH_SLOPE + 1e-6)
      }
    }
  })

  it('geniş yakın bölge tam derinliğini korur, kenarlar düzlemde kalır', () => {
    const aspect = 1.5
    const { cols, rows } = chooseGridSize(aspect, false)
    const w = cols + 1
    const depth: number[] = []
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) depth.push(i > cols * 0.2 && i < cols * 0.8 && j > rows * 0.2 && j < rows * 0.8 ? 255 : 0)
    const out = buildDepthOffsets(depth, cols, rows, aspect)
    expect(out[Math.round(rows / 2) * w + Math.round(cols / 2)]).toBeCloseTo(DEPTH_SCALE)
    for (let i = 0; i <= cols; i++) {
      expect(out[i]).toBe(0)
      expect(out[rows * w + i]).toBe(0)
    }
    for (let j = 0; j <= rows; j++) {
      expect(out[j * w]).toBe(0)
      expect(out[j * w + cols]).toBe(0)
    }
  })

  it('geçersiz en-boy oranında ve bozuk girdide sonlu ve [0, DEPTH_SCALE] içinde kalır', () => {
    const out = buildDepthOffsets([NaN, 999, -1], 20, 10, NaN)
    expect(out.length).toBe(21 * 11)
    expect(out.every((x) => Number.isFinite(x) && x >= 0 && x <= DEPTH_SCALE)).toBe(true)
  })
})
