import { describe, expect, it } from 'vitest'
import { FULL_VIEW, yearToPosition } from './scale'
import type { View } from './scale'
import { computeTicks } from './ticks'

const between = (a: number, b: number): View => ({ start: yearToPosition(a), end: yearToPosition(b) })

function expectSane(ticks: ReturnType<typeof computeTicks>) {
  for (const t of ticks) expect(t.year).not.toBe(0)
  for (let i = 1; i < ticks.length; i++) expect(ticks[i].year).toBeGreaterThan(ticks[i - 1].year)
}

describe('computeTicks', () => {
  it('tam görünümde makul sayıda, sıralı, 0 içermeyen etiket üretir', () => {
    const t = computeTicks(FULL_VIEW, 600)
    expect(t.length).toBeGreaterThanOrEqual(3)
    expect(t.length).toBeLessThanOrEqual(Math.floor(600 / 72) + 1)
    expectSane(t)
  })
  it('1440-1470 penceresinde en az 2 etiket çıkar', () => {
    const t = computeTicks(between(1440, 1470), 600)
    expect(t.length).toBeGreaterThanOrEqual(2)
    for (const x of t) {
      expect(x.year).toBeGreaterThanOrEqual(1440)
      expect(x.year).toBeLessThanOrEqual(1470)
    }
    expectSane(t)
  })
  it('MÖ 300 - MÖ 200 penceresinde en az 2 etiket çıkar', () => {
    const t = computeTicks(between(-300, -200), 600)
    expect(t.length).toBeGreaterThanOrEqual(2)
    expectSane(t)
  })
  it('0 civarındaki pencerede 0 etiketi çıkmaz', () => {
    const t = computeTicks(between(-30, 30), 600)
    expect(t.length).toBeGreaterThanOrEqual(2)
    expectSane(t)
  })
  it('2026 görünürse etiketlenir', () => {
    expect(computeTicks(FULL_VIEW, 600).map((x) => x.year)).toContain(2026)
    expect(computeTicks(between(2000, 2050), 600).map((x) => x.year)).toContain(2026)
  })
  it('kenara yakın etiketler hizalanır', () => {
    const t = computeTicks(FULL_VIEW, 600)
    expect(t.every((x) => x.left >= 0 && x.left <= 100)).toBe(true)
    for (const x of t) {
      const px = (x.left / 100) * 600
      if (px < 48) expect(x.align).toBe('start')
      if (px > 552) expect(x.align).toBe('end')
    }
  })
})
