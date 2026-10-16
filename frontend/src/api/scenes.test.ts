import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createScene, SceneTimeoutError, waitForScene, type Scene, type SceneStatus } from './scenes'

const req = { year: -44, latitude: 41.9, longitude: 12.5 }

function scene(status: SceneStatus, extra: Partial<Scene> = {}): Scene {
  return { id: 's1', status, request: req, result: null, error: null, createdAt: '2026-10-15T15:30:00Z', ...extra }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createScene', () => {
  it('JSON gövdesiyle POST eder', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(scene('PENDING'), 202))
    vi.stubGlobal('fetch', fetchMock)
    const s = await createScene(req)
    expect(s.status).toBe('PENDING')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/scenes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(req)
  })

  it('400 gövdesindeki mesajı ApiError olarak fırlatır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'year 0 olamaz' }, 400)))
    await expect(createScene(req)).rejects.toMatchObject({ name: 'ApiError', status: 400, message: 'year 0 olamaz' })
  })

  it('JSON olmayan hata gövdesinde genel mesaj verir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })))
    const err = await createScene(req).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
    expect(err.message).toBe('Sunucu hatası (502)')
  })

  it('ağ hatasını olduğu gibi iletir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(createScene(req)).rejects.toBeInstanceOf(TypeError)
  })
})

describe('waitForScene', () => {
  it('PENDING→RUNNING→READY sırasıyla onStatus çağırır', async () => {
    const ready = scene('READY', { result: { panoramaUrl: '/p.png', depthUrl: '/d.png' } })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(scene('PENDING')))
      .mockResolvedValueOnce(json(scene('PENDING')))
      .mockResolvedValueOnce(json(scene('RUNNING')))
      .mockResolvedValueOnce(json(ready))
    vi.stubGlobal('fetch', fetchMock)
    const seen: SceneStatus[] = []
    const p = waitForScene('s1', { intervalMs: 100, onStatus: (s) => seen.push(s) })
    await vi.advanceTimersByTimeAsync(300)
    const result = await p
    expect(result.result?.panoramaUrl).toBe('/p.png')
    expect(seen).toEqual(['PENDING', 'RUNNING', 'READY'])
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('FAILED durumunu hata mesajıyla döner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(scene('FAILED', { error: 'üretici çöktü' }))))
    const result = await waitForScene('s1', { intervalMs: 100 })
    expect(result.status).toBe('FAILED')
    expect(result.error).toBe('üretici çöktü')
  })

  it('404 ApiError fırlatır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'sahne yok' }, 404)))
    await expect(waitForScene('x')).rejects.toMatchObject({ status: 404, message: 'sahne yok' })
  })

  it('ağ hatasını iletir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(waitForScene('s1')).rejects.toBeInstanceOf(TypeError)
  })

  it('zaman aşımında SceneTimeoutError fırlatır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json(scene('RUNNING'))))
    const p = waitForScene('s1', { intervalMs: 100, timeoutMs: 350 })
    const assertion = expect(p).rejects.toBeInstanceOf(SceneTimeoutError)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it('bekleme sırasında iptal edilince AbortError fırlatır ve yoklamayı durdurur', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(scene('RUNNING')))
    vi.stubGlobal('fetch', fetchMock)
    const ctrl = new AbortController()
    const p = waitForScene('s1', { intervalMs: 100, signal: ctrl.signal })
    const assertion = expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(150)
    ctrl.abort()
    await assertion
    const calls = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('başlamadan iptal edilmişse istek atmaz', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(waitForScene('s1', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
