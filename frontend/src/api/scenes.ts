// Tipler docs/API.md ile birebir.
export type SceneStatus = 'PENDING' | 'RUNNING' | 'READY' | 'FAILED'

/** Üretim aşaması; yalnızca RUNNING iken dolu, sırası bu (docs/FAZ3.md §3). */
export type SceneStage = 'LOCATING' | 'IMAGE_SEARCH' | 'DEPTH' | 'PACKAGING'

/** Seçilen yılın dönem kovası (docs/FAZ3.md §2). */
export interface ScenePeriod {
  id: string
  name: string
  yearFrom: number
  yearTo: number
  confidence: 'gercek' | 'yorum' | 'kurgu'
}

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
  /** Seçilen dönem; yoksa ya da geçersizse alan hiç bulunmaz. */
  period?: ScenePeriod | null
}

export interface Scene {
  id: string
  status: SceneStatus
  /** Yalnızca RUNNING iken dolu; bilinmeyen değer null sayılır. */
  stage?: SceneStage | null
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

const STAGES: readonly string[] = ['LOCATING', 'IMAGE_SEARCH', 'DEPTH', 'PACKAGING']
const CONFIDENCES: readonly string[] = ['gercek', 'yorum', 'kurgu']

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** Bilinmeyen ya da yanlış tipli aşama null sayılır. */
export function sanitizeStage(raw: unknown): SceneStage | null {
  return typeof raw === 'string' && STAGES.includes(raw) ? (raw as SceneStage) : null
}

function sanitizePeriod(raw: unknown): ScenePeriod | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const id = str(p.id)
  const name = str(p.name)
  const { yearFrom, yearTo, confidence } = p
  if (!id || !name) return null
  if (!Number.isInteger(yearFrom) || !Number.isInteger(yearTo)) return null
  if (typeof confidence !== 'string' || !CONFIDENCES.includes(confidence)) return null
  return { id, name, yearFrom: yearFrom as number, yearTo: yearTo as number, confidence: confidence as ScenePeriod['confidence'] }
}

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
  const period = sanitizePeriod(r.period)
  if (period) result.period = period
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
    return { ...(b as Scene), stage: sanitizeStage(b.stage), result: sanitizeResult(b.result) }
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

/** 503 (sunucu meşgul) yanıtında yeniden denemeden önce beklenecek varsayılan süre (docs/API.md). */
export const DEFAULT_RETRY_AFTER_SEC = 5
export const MAX_RETRY_AFTER_SEC = 30
const MIN_RETRY_AFTER_SEC = 1
/** `createScene` 503 alınca en çok bu kadar yeniden dener (toplam istek = 1 + bu sayı). */
export const MAX_BUSY_RETRIES = 3

/** RFC 9110 IMF-fixdate, ör. `Sun, 06 Nov 1994 08:49:37 GMT`. Eski HTTP tarih biçimleri desteklenmez. */
const IMF_FIXDATE = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/

/**
 * `Retry-After` başlığı → beklenecek saniye.
 * - Tam sayı saniye (`"2"`) olduğu gibi alınır.
 * - IMF-fixdate biçimindeki tarih, `now`'dan o ana kalan süreye (yukarı yuvarlanarak) çevrilir.
 * - Başlık yoksa ya da geçersizse (negatif, kesirli, başka tarih biçimi, metin) 5 sn.
 * Sonuç [1, 30] aralığına kırpılır: 0 ya da geçmiş tarih sunucuyu beklemeden yormasın diye en az 1 sn,
 * aşırı uzun değerler kullanıcıyı bekletmesin diye en çok 30 sn.
 */
export function retryAfterSeconds(header: string | null | undefined, now: number = Date.now()): number {
  const raw = header?.trim() ?? ''
  let sec = DEFAULT_RETRY_AFTER_SEC
  if (/^\d+$/.test(raw)) {
    sec = Number(raw)
  } else if (IMF_FIXDATE.test(raw)) {
    const at = Date.parse(raw)
    if (Number.isFinite(at)) sec = Math.ceil((at - now) / 1000)
  }
  return Math.min(MAX_RETRY_AFTER_SEC, Math.max(MIN_RETRY_AFTER_SEC, sec))
}

/**
 * Sunucu 503 döndüğünde, beklemeye başlamadan hemen önce çağrılır.
 * `seconds`: beklenecek süre (geri sayım için); `attempt`: birazdan yapılacak yeniden denemenin sırası (1'den başlar).
 */
export type RetryWaitHandler = (seconds: number, attempt: number) => void

export interface CreateOptions extends CallOptions {
  /** Deneme başına istek zaman aşımı; 503 sonrası beklemeler bu süreye dahil değildir. */
  timeoutMs?: number
  onRetryWait?: RetryWaitHandler
}

/**
 * Sahne üretimini başlatır. 503 gelirse `Retry-After` kadar bekleyip en çok 3 kez yeniden dener;
 * hâlâ 503 ise `ApiError(503)` fırlatır. Diğer hata durumları yeniden denenmez.
 * Bekleme sırasında dış sinyal iptal edilirse `AbortError` fırlatır ve yeni istek atmaz.
 */
export async function createScene(
  req: SceneRequest,
  { signal, timeoutMs = 30000, onRetryWait }: CreateOptions = {},
): Promise<Scene> {
  for (let attempt = 0; ; attempt++) {
    const t = withTimeout(signal, timeoutMs)
    let res: Response
    try {
      res = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: t.signal,
      })
      if (res.status !== 503 || attempt >= MAX_BUSY_RETRIES) return await parseOrThrow(res)
    } catch (e) {
      throw t.translate(e)
    } finally {
      t.dispose()
    }
    const seconds = retryAfterSeconds(res.headers.get('Retry-After'))
    onRetryWait?.(seconds, attempt + 1)
    await sleep(seconds * 1000, signal)
  }
}

const sceneUrl = (id: string) => `/api/scenes/${encodeURIComponent(id)}`

export async function getScene(id: string, { signal }: CallOptions = {}): Promise<Scene> {
  const res = await fetch(sceneUrl(id), { signal })
  return parseOrThrow(res)
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
  /**
   * true ise yoklamada gelen 503 hata sayılmaz: `Retry-After` kadar beklenip yoklamaya devam edilir.
   * Varsayılan false (eski davranış: 503 → `ApiError(503)`); arayüz bağlanınca (#63) açılır.
   */
  retryOnBusy?: boolean
  /** `retryOnBusy` iken yoklama 503 aldığında çağrılır; `attempt` art arda gelen 503 sayısıdır (başarılı yanıtta sıfırlanır). */
  onRetryWait?: RetryWaitHandler
}

/**
 * READY ya da FAILED olana kadar yoklar ve son durumu döner. Toplam süre tek bir sinyalle sınırlıdır:
 * asılı kalan istek de dahil zaman aşımında SceneTimeoutError, dış iptalde AbortError fırlatır.
 * `retryOnBusy` iken 503 gelirse `Retry-After` kadar bekleyip aynı kimlikle yoklamaya devam eder;
 * deneme sayısı sınırsızdır, yalnızca toplam zaman aşımı geçerlidir.
 */
export async function waitForScene(
  id: string,
  { intervalMs = 1000, timeoutMs = 60000, signal: outer, onStatus, retryOnBusy = false, onRetryWait }: WaitOptions = {},
): Promise<Scene> {
  const t = withTimeout(outer, timeoutMs)
  const { signal } = t
  let last: SceneStatus | null = null
  let busy = 0
  try {
    for (;;) {
      if (signal.aborted) throw abortError()
      const res = await fetch(sceneUrl(id), { signal })
      if (signal.aborted) throw abortError()
      if (retryOnBusy && res.status === 503) {
        busy++
        const seconds = retryAfterSeconds(res.headers.get('Retry-After'))
        onRetryWait?.(seconds, busy)
        await sleep(seconds * 1000, signal)
        continue
      }
      busy = 0
      const scene = await parseOrThrow(res)
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
