import { failedMessage, NO_IMAGE_MESSAGE, NO_PERIOD_MESSAGE } from '../api/errorMessages'
import {
  ApiError,
  createScene,
  DEFAULT_RETRY_AFTER_SEC,
  getScene,
  SceneTimeoutError,
  type RetryWaitHandler,
  type Scene,
  type SceneRequest,
} from '../api/scenes'
import type { SceneErrorKind } from '../scene/SceneError'

export const POLL_INTERVAL_MS = 1000
export const POLL_TIMEOUT_MS = 120_000

export interface RunSceneOptions {
  signal: AbortSignal
  /** Her yanıtta çağrılır (POST dahil); aşama (`stage`) değişimi de buradan gelir. */
  onUpdate(scene: Scene): void
  /**
   * Sunucu meşgulken (503) beklemeye başlamadan önce çağrılır: POST'ta `createScene` en çok 3 kez yeniden dener
   * (Retry-After'a göre); yoklamada 503 hata sayılmaz, 5 sn beklenip devam edilir (toplam zaman aşımı geçerli).
   */
  onRetryWait?: RetryWaitHandler
  intervalMs?: number
  timeoutMs?: number
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
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

/**
 * Sahneyi ister ve READY ya da FAILED olana kadar yoklar; son durumu döner.
 * `waitForScene` yalnızca durum (status) değişince bildirir; yükleme ekranı aşamayı (stage) da göstermek için
 * her yanıtı ister, bu yüzden yoklama burada `getScene` ile yapılır. Toplam yoklama süresi `timeoutMs` ile
 * sınırlıdır (asılı istek dahil): aşılırsa SceneTimeoutError, dış iptalde AbortError.
 */
export async function runScene(
  req: SceneRequest,
  { signal: outer, onUpdate, onRetryWait, intervalMs = POLL_INTERVAL_MS, timeoutMs = POLL_TIMEOUT_MS }: RunSceneOptions,
): Promise<Scene> {
  const created = await createScene(req, { signal: outer, onRetryWait })
  if (outer.aborted) throw abortError()
  onUpdate(created)
  if (created.status === 'READY' || created.status === 'FAILED') return created

  const ctl = new AbortController()
  let timedOut = false
  const onOuter = () => ctl.abort()
  outer.addEventListener('abort', onOuter, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort()
  }, timeoutMs)
  const { signal } = ctl
  try {
    // İlk yoklama hemen: önbellekteki sahne çoğu zaman bu yanıtta hazırdır (yükleyici hiç görünmez).
    let busy = 0
    for (;;) {
      let scene: Scene
      try {
        scene = await getScene(created.id, { signal })
      } catch (e) {
        // Yoklamada 503 (ör. vekil sunucu): hata değil, bekleyip aynı işi yoklamaya devam et.
        // getScene yanıt başlıklarını vermediği için Retry-After yerine varsayılan süre kullanılır.
        if (!(e instanceof ApiError && e.status === 503) || signal.aborted) throw e
        busy++
        onRetryWait?.(DEFAULT_RETRY_AFTER_SEC, busy)
        await sleep(DEFAULT_RETRY_AFTER_SEC * 1000, signal)
        continue
      }
      busy = 0
      if (signal.aborted) throw abortError()
      onUpdate(scene)
      if (scene.status === 'READY' || scene.status === 'FAILED') return scene
      await sleep(intervalMs, signal)
    }
  } catch (e) {
    if (timedOut && !outer.aborted) throw new SceneTimeoutError(timeoutMs)
    throw e
  } finally {
    clearTimeout(timer)
    outer.removeEventListener('abort', onOuter)
  }
}

/** FAILED sahnenin sunucu metni → hata ekranı türü (metin eşlemesi `errorMessages.ts`'ten). */
export function failedKind(serverError: string | null): SceneErrorKind {
  const message = failedMessage(serverError)
  if (message === NO_IMAGE_MESSAGE) return 'no-image'
  if (message === NO_PERIOD_MESSAGE) return 'no-period'
  return 'unknown'
}

/** İstek/yoklama hatası → hata ekranı türü. Sunucu metni hiçbir yolda gösterilmez. */
export function errorKind(e: unknown): SceneErrorKind {
  if (e instanceof ApiError) return e.status === 503 ? 'busy' : 'unknown'
  if (e instanceof SceneTimeoutError) return 'timeout'
  if (e instanceof TypeError) return 'network'
  return 'unknown'
}
