import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, SceneTimeoutError, type Scene } from '../api/scenes'
import { errorKind, failedKind, runScene } from './sceneJob'

const scene = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 's1',
  status,
  request: { year: 1453, latitude: 41, longitude: 29 },
  result: null,
  error: null,
  createdAt: '2026-10-25T10:00:00Z',
  ...extra,
})
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const READY = scene('READY', { result: { panoramaUrl: '/p.jpg', depthUrl: '/d.png' } })
const REQ = { year: 1453, latitude: 41, longitude: 29 }

function stub(...responses: (() => Response)[]) {
  let i = 0
  const fn = vi.fn(async () => responses[Math.min(i++, responses.length - 1)]())
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('runScene', () => {
  it('her yoklama yanıtını bildirir (aşama değişimi dahil), ilk yoklama hemen yapılır', async () => {
    const fn = stub(
      () => json(scene('PENDING'), 202),
      () => json(scene('RUNNING', { stage: 'LOCATING' })),
      () => json(scene('RUNNING', { stage: 'DEPTH' })),
      () => json(READY),
    )
    const seen: (string | null | undefined)[] = []
    const p = runScene(REQ, { signal: new AbortController().signal, onUpdate: (s: Scene) => seen.push(s.stage) })
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2) // POST + ilk GET beklemeden
    await vi.advanceTimersByTimeAsync(2000)
    const done = await p
    expect(done.status).toBe('READY')
    expect(seen).toEqual([null, 'LOCATING', 'DEPTH', null]) // READY yanıtı da bildirilir
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual(REQ)
  })

  it('POST hemen READY dönerse yoklamaz', async () => {
    const fn = stub(() => json(READY, 200))
    const done = await runScene(REQ, { signal: new AbortController().signal, onUpdate: () => {} })
    expect(done.status).toBe('READY')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('POST 503: onRetryWait(saniye, deneme) ile bekleyip yeniden dener', async () => {
    const fn = stub(() => json({ error: 'busy' }, 503, { 'Retry-After': '2' }), () => json(scene('PENDING'), 202), () => json(READY))
    const waits: number[][] = []
    const p = runScene(REQ, { signal: new AbortController().signal, onUpdate: () => {}, onRetryWait: (s, a) => waits.push([s, a]) })
    await vi.advanceTimersByTimeAsync(2000)
    expect((await p).status).toBe('READY')
    expect(waits).toEqual([[2, 1]])
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('yoklamada 503 hata sayılmaz: 5 sn bekleyip devam eder', async () => {
    stub(() => json(scene('PENDING'), 202), () => json({ error: 'busy' }, 503), () => json({ error: 'busy' }, 503), () => json(READY))
    const waits: number[][] = []
    const p = runScene(REQ, { signal: new AbortController().signal, onUpdate: () => {}, onRetryWait: (s, a) => waits.push([s, a]) })
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await p).status).toBe('READY')
    expect(waits).toEqual([[5, 1], [5, 2]])
  })

  it('zaman aşımında SceneTimeoutError', async () => {
    stub(() => json(scene('PENDING'), 202), () => json(scene('RUNNING')))
    const p = runScene(REQ, { signal: new AbortController().signal, onUpdate: () => {}, timeoutMs: 3000 })
    const caught = p.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(3500)
    expect(await caught).toBeInstanceOf(SceneTimeoutError)
  })

  it('dış iptalde AbortError; yoklama sinyali de iptal olur', async () => {
    const fn = stub(() => json(scene('PENDING'), 202), () => json(scene('RUNNING')))
    const ctl = new AbortController()
    const p = runScene(REQ, { signal: ctl.signal, onUpdate: () => {} })
    const caught = p.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1500)
    ctl.abort()
    const e = await caught
    expect((e as Error).name).toBe('AbortError')
    const getSignals = fn.mock.calls.slice(1).map((c) => (c as unknown as [string, RequestInit])[1].signal!)
    expect(getSignals.every((s) => s.aborted)).toBe(true)
  })

  it('yoklamada 503 dışındaki hata yükselir', async () => {
    stub(() => json(scene('PENDING'), 202), () => json({ error: 'x' }, 500))
    await expect(runScene(REQ, { signal: new AbortController().signal, onUpdate: () => {} })).rejects.toBeInstanceOf(ApiError)
  })
})

describe('hata türleri', () => {
  it('FAILED metni → tür', () => {
    expect(failedKind('no image found for location')).toBe('no-image')
    expect(failedKind('no scene for period')).toBe('no-period')
    expect(failedKind('generation failed')).toBe('unknown')
    expect(failedKind(null)).toBe('unknown')
  })

  it('istisna → tür', () => {
    expect(errorKind(new ApiError(503, 'busy'))).toBe('busy')
    expect(errorKind(new ApiError(400, 'x'))).toBe('unknown')
    expect(errorKind(new ApiError(404, 'x'))).toBe('unknown')
    expect(errorKind(new SceneTimeoutError(1000))).toBe('timeout')
    expect(errorKind(new TypeError('Failed to fetch'))).toBe('network')
    expect(errorKind(new Error('garip'))).toBe('unknown')
  })
})
