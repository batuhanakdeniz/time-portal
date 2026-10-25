import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiErrorMessage, BUSY_MESSAGE } from './errorMessages'
import {
  ApiError,
  createScene,
  getScene,
  retryAfterSeconds,
  sanitizeResult,
  sanitizeStage,
  SceneTimeoutError,
  waitForScene,
  type Scene,
  type SceneStatus,
} from './scenes'

const req = { year: -44, latitude: 41.9, longitude: 12.5 }

function scene(status: SceneStatus, extra: Partial<Scene> = {}): Scene {
  return { id: 's1', status, request: req, result: null, error: null, createdAt: '2026-10-15T15:30:00Z', ...extra }
}
// Gerçek fetch gibi: hiç çözülmez ama sinyal iptal edilince reddeder.
const hangingFetch = () =>
  vi.fn().mockImplementation(
    (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      }),
  )
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

  it('2xx ama JSON olmayan gövdede geçersiz yanıt hatası verir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>', { status: 200 })))
    await expect(createScene(req)).rejects.toMatchObject({ name: 'ApiError', status: 200, message: 'Sunucudan geçersiz yanıt' })
  })

  it('bilinmeyen status değerini geçersiz yanıt sayar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(scene('BILINMEYEN' as SceneStatus), 202)))
    await expect(createScene(req)).rejects.toMatchObject({ message: 'Sunucudan geçersiz yanıt' })
  })

  it('yanıt hiç gelmezse SceneTimeoutError fırlatır', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const assertion = expect(createScene(req, { timeoutMs: 500 })).rejects.toBeInstanceOf(SceneTimeoutError)
    await vi.advanceTimersByTimeAsync(600)
    await assertion
  })

  it('ağ hatasını olduğu gibi iletir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(createScene(req)).rejects.toBeInstanceOf(TypeError)
  })
})

describe('sanitizeResult', () => {
  const ok = { panoramaUrl: '/p.jpg', depthUrl: '/d.png' }

  it('eski sözleşme (yeni alan yok) panorama sayılır', () => {
    expect(sanitizeResult(ok)).toEqual({ ...ok, kind: 'panorama', place: null, attribution: null })
  })
  it('geçerli photo, place ve attribution korunur', () => {
    const r = sanitizeResult({
      ...ok,
      kind: 'photo',
      place: { province: 'İstanbul', district: 'Beyoğlu' },
      attribution: { author: 'a', license: 'CC0', licenseUrl: 'https://x.y', sourceUrl: null, provider: 'wikimedia-commons' },
    })
    expect(r?.kind).toBe('photo')
    expect(r?.place).toEqual({ province: 'İstanbul', district: 'Beyoğlu' })
    expect(r?.attribution).toEqual({ author: 'a', license: 'CC0', licenseUrl: 'https://x.y', sourceUrl: null, provider: 'wikimedia-commons' })
  })
  it('yanlış tipli alanlar yok sayılır', () => {
    const r = sanitizeResult({ ...ok, kind: 5, place: 'İstanbul', attribution: { author: 3, provider: 7 } })
    expect(r).toEqual({ ...ok, kind: 'panorama', place: null, attribution: null })
    expect(sanitizeResult({ ...ok, place: { province: 'X' } })?.place).toBeNull()
    expect(sanitizeResult({ ...ok, attribution: { provider: 'sample', author: 1, license: {}, licenseUrl: [], sourceUrl: true } })?.attribution).toEqual({
      author: null,
      license: null,
      licenseUrl: null,
      sourceUrl: null,
      provider: 'sample',
    })
  })
  it('panoramaUrl yoksa ya da sonuç nesne değilse null', () => {
    expect(sanitizeResult(null)).toBeNull()
    expect(sanitizeResult('x')).toBeNull()
    expect(sanitizeResult({ depthUrl: '/d.png' })).toBeNull()
  })
})

describe('period', () => {
  const ok = { panoramaUrl: '/p.jpg', depthUrl: '/d.png' }
  const period = { id: 'osmanli-klasik', name: 'Osmanlı klasik', yearFrom: 1453, yearTo: 1700, confidence: 'yorum' }

  it('geçerli dönem korunur', () => {
    expect(sanitizeResult({ ...ok, period })?.period).toEqual(period)
    const mo = { id: 'demir', name: 'Demir Çağı', yearFrom: -1200, yearTo: -550, confidence: 'yorum' }
    expect(sanitizeResult({ ...ok, period: mo })?.period).toEqual(mo)
  })
  it('dönem yoksa alan hiç eklenmez', () => {
    expect(sanitizeResult(ok)).not.toHaveProperty('period')
    expect(sanitizeResult({ ...ok, period: null })).not.toHaveProperty('period')
  })
  it('eksik ya da yanlış tipli dönem yok sayılır', () => {
    const bad: unknown[] = [
      'osmanli-klasik',
      5,
      [],
      { ...period, id: '' },
      { ...period, id: 3 },
      { ...period, name: undefined },
      { ...period, yearFrom: '1453' },
      { ...period, yearTo: 1700.5 },
      { ...period, yearFrom: Number.NaN },
      { ...period, confidence: 'kesin' },
      { ...period, confidence: undefined },
    ]
    for (const p of bad) {
      const r = sanitizeResult({ ...ok, period: p })
      expect(r).not.toBeNull()
      expect(r).not.toHaveProperty('period')
    }
  })
  it('dönem geçersiz olsa da diğer alanlar korunur', () => {
    const r = sanitizeResult({ ...ok, kind: 'photo', place: { province: 'İstanbul', district: 'Beyoğlu' }, period: { id: 'x' } })
    expect(r?.kind).toBe('photo')
    expect(r?.place).toEqual({ province: 'İstanbul', district: 'Beyoğlu' })
  })
})

describe('stage', () => {
  it('bilinen aşamalar korunur, diğerleri null', () => {
    for (const s of ['LOCATING', 'IMAGE_SEARCH', 'DEPTH', 'PACKAGING']) expect(sanitizeStage(s)).toBe(s)
    for (const s of [undefined, null, '', 'locating', 'UPLOADING', 3, {}]) expect(sanitizeStage(s)).toBeNull()
  })
  it('yanıttaki stage ayrıştırılır; yoksa ya da bilinmiyorsa null', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(scene('RUNNING', { stage: 'DEPTH' })))
      .mockResolvedValueOnce(json({ ...scene('RUNNING'), stage: 'BOGUS' }))
      .mockResolvedValueOnce(json(scene('PENDING')))
    vi.stubGlobal('fetch', fetchMock)
    expect((await getScene('s1')).stage).toBe('DEPTH')
    expect((await getScene('s1')).stage).toBeNull()
    expect((await getScene('s1')).stage).toBeNull()
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

  it('onScene her yanıtta çağrılır (aynı durumda aşama değişimi ve son yanıt dahil); ilk yoklama beklemeden', async () => {
    const ready = scene('READY', { result: { panoramaUrl: '/p.png', depthUrl: '/d.png' } })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(scene('RUNNING', { stage: 'LOCATING' })))
      .mockResolvedValueOnce(json(scene('RUNNING', { stage: 'DEPTH' })))
      .mockResolvedValueOnce(json(ready))
    vi.stubGlobal('fetch', fetchMock)
    const stages: (string | null | undefined)[] = []
    const statuses: SceneStatus[] = []
    const p = waitForScene('s1', { intervalMs: 100, onScene: (s) => stages.push(s.stage), onStatus: (s) => statuses.push(s) })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(stages).toEqual(['LOCATING'])
    await vi.advanceTimersByTimeAsync(200)
    await expect(p).resolves.toMatchObject({ status: 'READY' })
    expect(stages).toEqual(['LOCATING', 'DEPTH', null])
    expect(statuses).toEqual(['RUNNING', 'READY'])
  })

  it('onScene 503 beklemesinde çağrılmaz', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(scene('RUNNING', { stage: 'IMAGE_SEARCH' })))
      .mockResolvedValueOnce(busy('1'))
      .mockResolvedValueOnce(json(scene('READY')))
    vi.stubGlobal('fetch', fetchMock)
    const onScene = vi.fn()
    const p = waitForScene('s1', { intervalMs: 100, retryOnBusy: true, onScene })
    await vi.advanceTimersByTimeAsync(1100)
    await expect(p).resolves.toMatchObject({ status: 'READY' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(onScene.mock.calls.map(([s]) => s.status)).toEqual(['RUNNING', 'READY'])
  })

  it('iptal edildikten sonra gelen yanıt onScene çağırmaz', async () => {
    const ctrl = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        ctrl.abort()
        return json(scene('RUNNING'))
      }),
    )
    const onScene = vi.fn()
    await expect(waitForScene('s1', { signal: ctrl.signal, onScene })).rejects.toMatchObject({ name: 'AbortError' })
    expect(onScene).not.toHaveBeenCalled()
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

  it('asılı kalan tek bir istek de zaman aşımına uğrar', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const assertion = expect(waitForScene('s1', { intervalMs: 100, timeoutMs: 500 })).rejects.toBeInstanceOf(SceneTimeoutError)
    await vi.advanceTimersByTimeAsync(600)
    await assertion
  })

  it('dış iptal zaman aşımı sayılmaz', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const ctrl = new AbortController()
    const assertion = expect(waitForScene('s1', { timeoutMs: 5000, signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(100)
    ctrl.abort()
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

const busy = (retryAfter?: string) =>
  new Response(JSON.stringify({ error: 'too many active jobs' }), {
    status: 503,
    headers: retryAfter === undefined ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json', 'Retry-After': retryAfter },
  })

describe('retryAfterSeconds', () => {
  const now = Date.parse('Sun, 06 Nov 1994 08:49:30 GMT')

  it('tam sayı saniyeyi alır, [1, 30] aralığına kırpar', () => {
    expect(retryAfterSeconds('2', now)).toBe(2)
    expect(retryAfterSeconds(' 7 ', now)).toBe(7)
    expect(retryAfterSeconds('30', now)).toBe(30)
    expect(retryAfterSeconds('60', now)).toBe(30)
    expect(retryAfterSeconds('0', now)).toBe(1)
  })
  it('başlık yoksa ya da geçersizse 5 sn', () => {
    for (const h of [null, undefined, '', 'abc', '-3', '2.5', '1e2', 'Sunday, 06-Nov-94 08:49:37 GMT']) {
      expect(retryAfterSeconds(h, now)).toBe(5)
    }
  })
  it('IMF-fixdate tarihini kalan süreye çevirir', () => {
    expect(retryAfterSeconds('Sun, 06 Nov 1994 08:49:37 GMT', now)).toBe(7)
    expect(retryAfterSeconds('Sun, 06 Nov 1994 09:49:30 GMT', now)).toBe(30)
    expect(retryAfterSeconds('Sun, 06 Nov 1994 08:00:00 GMT', now)).toBe(1)
  })
})

describe('createScene 503 yeniden deneme', () => {
  async function expectRetryAfter(header: string | undefined, waitSec: number) {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(busy(header))
      .mockResolvedValueOnce(json(scene('PENDING'), 202))
    vi.stubGlobal('fetch', fetchMock)
    const onRetryWait = vi.fn()
    const p = createScene(req, { onRetryWait })
    await vi.advanceTimersByTimeAsync(waitSec * 1000 - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onRetryWait).toHaveBeenCalledWith(waitSec, 1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toMatchObject({ status: 'PENDING' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/scenes')
    expect(fetchMock.mock.calls[1][1].method).toBe('POST')
  }

  it('Retry-After: 2 → 2 sn bekleyip yeniden dener', () => expectRetryAfter('2', 2))
  it('başlık yoksa 5 sn bekler', () => expectRetryAfter(undefined, 5))
  it('geçersiz başlıkta 5 sn bekler', () => expectRetryAfter('soon', 5))
  it('60 sn 30 sn ile sınırlanır', () => expectRetryAfter('60', 30))

  it('3 yeniden denemeden sonra hâlâ 503 ise ApiError(503) fırlatır', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => busy('1'))
    vi.stubGlobal('fetch', fetchMock)
    const onRetryWait = vi.fn()
    const p = createScene(req, { onRetryWait })
    const caught = p.catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    const err = await caught
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 503, message: 'too many active jobs' })
    expect(apiErrorMessage(err.status, err.message)).toBe(BUSY_MESSAGE)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(onRetryWait.mock.calls).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
    ])
  })

  it('bekleme sırasında iptal edilince AbortError fırlatır ve yeniden istek atmaz', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => busy('5'))
    vi.stubGlobal('fetch', fetchMock)
    const ctrl = new AbortController()
    const assertion = expect(createScene(req, { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(2000)
    ctrl.abort()
    await assertion
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('202 gelince durur', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(busy('1'))
      .mockResolvedValueOnce(json(scene('PENDING'), 202))
      .mockImplementation(async () => busy('1'))
    vi.stubGlobal('fetch', fetchMock)
    const p = createScene(req)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toMatchObject({ id: 's1', status: 'PENDING' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('400 yeniden denenmez', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ error: 'location outside supported area' }, 400))
    vi.stubGlobal('fetch', fetchMock)
    const onRetryWait = vi.fn()
    await expect(createScene(req, { onRetryWait })).rejects.toMatchObject({ status: 400 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onRetryWait).not.toHaveBeenCalled()
  })

  it('500 yeniden denenmez', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ error: 'boom' }, 500))
    vi.stubGlobal('fetch', fetchMock)
    await expect(createScene(req)).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('onRetryWait her beklemeden önce, istekler arasında sırayla çağrılır', async () => {
    const events: string[] = []
    const responses = [busy('3'), busy('1'), json(scene('PENDING'), 202)]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        events.push('fetch')
        return responses.shift()
      }),
    )
    const p = createScene(req, { onRetryWait: (sec, attempt) => events.push(`wait:${sec}:${attempt}`) })
    await vi.advanceTimersByTimeAsync(4000)
    await p
    expect(events).toEqual(['fetch', 'wait:3:1', 'fetch', 'wait:1:2', 'fetch'])
  })

  it('503 sonrası bekleme deneme başına zaman aşımına sayılmaz', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(busy('2'))
      .mockResolvedValueOnce(json(scene('PENDING'), 202))
    vi.stubGlobal('fetch', fetchMock)
    const p = createScene(req, { timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(2000)
    await expect(p).resolves.toMatchObject({ status: 'PENDING' })
  })
})

describe('waitForScene 503', () => {
  it('503 gelince Retry-After kadar bekleyip aynı kimlikle yoklamaya devam eder', async () => {
    const ready = scene('READY', { result: { panoramaUrl: '/p.png', depthUrl: '/d.png' } })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(scene('PENDING')))
      .mockResolvedValueOnce(busy('2'))
      .mockResolvedValueOnce(json(scene('RUNNING')))
      .mockResolvedValueOnce(json(ready))
    vi.stubGlobal('fetch', fetchMock)
    const onRetryWait = vi.fn()
    const seen: SceneStatus[] = []
    const p = waitForScene('s1', { intervalMs: 100, timeoutMs: 120_000, retryOnBusy: true, onRetryWait, onStatus: (s) => seen.push(s) })
    await vi.advanceTimersByTimeAsync(100)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onRetryWait).toHaveBeenCalledWith(2, 1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(101)
    const result = await p
    expect(result.status).toBe('READY')
    expect(seen).toEqual(['PENDING', 'RUNNING', 'READY'])
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(Array(4).fill('/api/scenes/s1'))
  })

  it('art arda 503 sayacı başarılı yanıtta sıfırlanır', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(busy('1'))
      .mockResolvedValueOnce(busy('1'))
      .mockResolvedValueOnce(json(scene('RUNNING')))
      .mockResolvedValueOnce(busy('1'))
      .mockResolvedValueOnce(json(scene('READY')))
    vi.stubGlobal('fetch', fetchMock)
    const onRetryWait = vi.fn()
    const p = waitForScene('s1', { intervalMs: 100, retryOnBusy: true, onRetryWait })
    await vi.advanceTimersByTimeAsync(5000)
    await expect(p).resolves.toMatchObject({ status: 'READY' })
    expect(onRetryWait.mock.calls).toEqual([
      [1, 1],
      [1, 2],
      [1, 1],
    ])
  })

  it('503 sürerse toplam zaman aşımında SceneTimeoutError fırlatır', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => busy('5'))
    vi.stubGlobal('fetch', fetchMock)
    const assertion = expect(waitForScene('s1', { timeoutMs: 120_000, retryOnBusy: true })).rejects.toBeInstanceOf(SceneTimeoutError)
    await vi.advanceTimersByTimeAsync(120_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(24)
  })

  it('503 beklemesinde iptal edilince AbortError fırlatır ve yoklamayı durdurur', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => busy('5'))
    vi.stubGlobal('fetch', fetchMock)
    const ctrl = new AbortController()
    const assertion = expect(waitForScene('s1', { signal: ctrl.signal, retryOnBusy: true })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(1000)
    ctrl.abort()
    await assertion
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retryOnBusy verilmezse 503 eskisi gibi ApiError(503) olur', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => busy('1'))
    vi.stubGlobal('fetch', fetchMock)
    const onRetryWait = vi.fn()
    await expect(waitForScene('s1', { onRetryWait })).rejects.toMatchObject({ name: 'ApiError', status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onRetryWait).not.toHaveBeenCalled()
  })
})
