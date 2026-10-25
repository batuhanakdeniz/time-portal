// Tipler docs/API.md ile birebir.
export type SceneStatus = 'PENDING' | 'RUNNING' | 'READY' | 'FAILED'

export interface SceneRequest {
  year: number
  latitude: number
  longitude: number
}

export interface ScenePlace {
  province: string
  district: string
}

export interface SceneAttribution {
  author: string | null
  license: string | null
  licenseUrl: string | null
  sourceUrl: string | null
  /** 'mapillary' | 'wikimedia-commons' | 'sample' ya da bilinmeyen bir sağlayıcı. */
  provider: string
}

export interface SceneResult {
  panoramaUrl: string
  depthUrl: string
  /** Yoksa panorama sayılır. */
  kind?: 'panorama' | 'photo'
  place?: ScenePlace | null
  attribution?: SceneAttribution | null
}

export interface Scene {
  id: string
  status: SceneStatus
  request: SceneRequest
  result: SceneResult | null
  error: string | null
  createdAt: string
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export class SceneTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Sahne ${timeoutMs} ms içinde hazır olmadı`)
    this.name = 'SceneTimeoutError'
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

interface CallOptions {
  signal?: AbortSignal
}

const STATUSES: readonly string[] = ['PENDING', 'RUNNING', 'READY', 'FAILED']
const INVALID_RESPONSE = 'Sunucudan geçersiz yanıt'

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** Gelen sonucu savunmacı doğrular: yanlış tipli isteğe bağlı alanlar yok sayılır. */
export function sanitizeResult(raw: unknown): SceneResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.panoramaUrl !== 'string' || r.panoramaUrl === '') return null
  const result: SceneResult = {
    panoramaUrl: r.panoramaUrl,
    depthUrl: typeof r.depthUrl === 'string' ? r.depthUrl : '',
    kind: r.kind === 'photo' ? 'photo' : 'panorama',
    place: null,
    attribution: null,
  }
  const p = r.place as Record<string, unknown> | null | undefined
  if (p && typeof p === 'object') {
    const province = str(p.province)
    const district = str(p.district)
    if (province && district) result.place = { province, district }
  }
  const a = r.attribution as Record<string, unknown> | null | undefined
  if (a && typeof a === 'object') {
    const provider = str(a.provider)
    if (provider) {
      result.attribution = {
        author: str(a.author),
        license: str(a.license),
        licenseUrl: str(a.licenseUrl),
        sourceUrl: str(a.sourceUrl),
        provider,
      }
    }
  }
  return result
}

async function parseOrThrow(res: Response): Promise<Scene> {
  if (res.ok) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      throw new ApiError(res.status, INVALID_RESPONSE)
    }
    const b = body as Partial<Scene> | null
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || typeof b.status !== 'string' || !STATUSES.includes(b.status)) {
      throw new ApiError(res.status, INVALID_RESPONSE)
    }
    return { ...(b as Scene), result: sanitizeResult(b.result) }
  }
  let message = `Sunucu hatası (${res.status})`
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim() !== '') message = body.error
  } catch {
    // gövde JSON değil: genel mesaj kalır
  }
  throw new ApiError(res.status, message)
}

function abortError(): Error {
  const e = new Error('İstek iptal edildi')
  e.name = 'AbortError'
  return e
}

/** Dış sinyal ile zaman aşımını tek sinyalde birleştirir (zamanlayıcı fake timers ile çalışır). */
function withTimeout(outer: AbortSignal | undefined, timeoutMs: number) {
  const ctl = new AbortController()
  let timedOut = false
  const onOuter = () => ctl.abort()
  if (outer?.aborted) ctl.abort()
  else outer?.addEventListener('abort', onOuter, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort()
  }, timeoutMs)
  return {
    signal: ctl.signal,
    /** Kendi zaman aşımımız tetiklendiyse hatayı SceneTimeoutError'a çevirir. */
    translate(e: unknown): unknown {
      return timedOut && !outer?.aborted ? new SceneTimeoutError(timeoutMs) : e
    },
    dispose() {
      clearTimeout(timer)
      outer?.removeEventListener('abort', onOuter)
    },
  }
}

export interface CreateOptions extends CallOptions {
  timeoutMs?: number
}

export async function createScene(req: SceneRequest, { signal, timeoutMs = 30000 }: CreateOptions = {}): Promise<Scene> {
  const t = withTimeout(signal, timeoutMs)
  try {
    const res = await fetch('/api/scenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: t.signal,
    })
    return await parseOrThrow(res)
  } catch (e) {
    throw t.translate(e)
  } finally {
    t.dispose()
  }
}

export async function getScene(id: string, { signal }: CallOptions = {}): Promise<Scene> {
  const res = await fetch(`/api/scenes/${encodeURIComponent(id)}`, { signal })
  return parseOrThrow(res)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export interface WaitOptions extends CallOptions {
  intervalMs?: number
  timeoutMs?: number
  onStatus?: (status: SceneStatus, scene: Scene) => void
}

/**
 * READY ya da FAILED olana kadar yoklar ve son durumu döner. Toplam süre tek bir sinyalle sınırlıdır:
 * asılı kalan istek de dahil zaman aşımında SceneTimeoutError, dış iptalde AbortError fırlatır.
 */
export async function waitForScene(
  id: string,
  { intervalMs = 1000, timeoutMs = 60000, signal: outer, onStatus }: WaitOptions = {},
): Promise<Scene> {
  const t = withTimeout(outer, timeoutMs)
  const { signal } = t
  let last: SceneStatus | null = null
  try {
    for (;;) {
      if (signal.aborted) throw abortError()
      const scene = await getScene(id, { signal })
      if (signal.aborted) throw abortError()
      if (scene.status !== last) {
        last = scene.status
        onStatus?.(scene.status, scene)
      }
      if (scene.status === 'READY' || scene.status === 'FAILED') return scene
      await sleep(intervalMs, signal)
    }
  } catch (e) {
    throw t.translate(e)
  } finally {
    t.dispose()
  }
}
