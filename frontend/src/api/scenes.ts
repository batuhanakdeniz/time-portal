// Tipler docs/API.md ile birebir.
export type SceneStatus = 'PENDING' | 'RUNNING' | 'READY' | 'FAILED'

export interface SceneRequest {
  year: number
  latitude: number
  longitude: number
}

export interface SceneResult {
  panoramaUrl: string
  depthUrl: string
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

async function parseOrThrow(res: Response): Promise<Scene> {
  if (res.ok) return (await res.json()) as Scene
  let message = `Sunucu hatası (${res.status})`
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim() !== '') message = body.error
  } catch {
    // gövde JSON değil: genel mesaj kalır
  }
  throw new ApiError(res.status, message)
}

export async function createScene(req: SceneRequest, { signal }: CallOptions = {}): Promise<Scene> {
  const res = await fetch('/api/scenes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })
  return parseOrThrow(res)
}

export async function getScene(id: string, { signal }: CallOptions = {}): Promise<Scene> {
  const res = await fetch(`/api/scenes/${encodeURIComponent(id)}`, { signal })
  return parseOrThrow(res)
}

function abortError(): Error {
  const e = new Error('İstek iptal edildi')
  e.name = 'AbortError'
  return e
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface WaitOptions extends CallOptions {
  intervalMs?: number
  timeoutMs?: number
  onStatus?: (status: SceneStatus, scene: Scene) => void
}

/** READY ya da FAILED olana kadar yoklar ve son durumu döner. Zaman aşımında SceneTimeoutError, iptalde AbortError fırlatır. */
export async function waitForScene(
  id: string,
  { intervalMs = 1000, timeoutMs = 60000, signal, onStatus }: WaitOptions = {},
): Promise<Scene> {
  const start = Date.now()
  let last: SceneStatus | null = null
  for (;;) {
    if (signal?.aborted) throw abortError()
    const scene = await getScene(id, { signal })
    if (signal?.aborted) throw abortError()
    if (scene.status !== last) {
      last = scene.status
      onStatus?.(scene.status, scene)
    }
    if (scene.status === 'READY' || scene.status === 'FAILED') return scene
    if (Date.now() - start + intervalMs > timeoutMs) throw new SceneTimeoutError(timeoutMs)
    await sleep(intervalMs, signal)
  }
}
