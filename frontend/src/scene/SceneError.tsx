import './SceneError.css'

export type SceneErrorKind = 'no-image' | 'no-period' | 'network' | 'busy' | 'timeout' | 'unknown'

export interface SceneErrorProps {
  kind: SceneErrorKind
  /** Yalnızca 'busy': sunucunun Retry-After süresi; geri sayımı sayfa (#64) günceller. */
  retryAfterSec?: number
  onRetry(): void
  onBack(): void
}

interface ErrorText {
  title: string
  detail: string
  /** false ise "Tekrar dene" gösterilmez (dönem sahnesi yokken denemek sonuç vermez). */
  retry: boolean
}

/** Hata türü → Türkçe metin. Sunucu metni hiçbir yolda gösterilmez. */
export function sceneErrorText(kind: SceneErrorKind, retryAfterSec?: number): ErrorText {
  switch (kind) {
    case 'no-image':
      return { title: 'Bu ilçe için görsel bulunamadı', detail: 'Açık lisanslı fotoğraf ya da 360° görüntü yok.', retry: true }
    case 'no-period':
      return { title: 'Bu dönem için sahne henüz yok.', detail: 'Başka bir yıl ya da yer seçebilirsin.', retry: false }
    case 'network':
      return { title: 'Sunucuya ulaşılamadı', detail: 'İnternet bağlantını kontrol edip tekrar dene.', retry: true }
    case 'busy': {
      const sec =
        typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? Math.ceil(retryAfterSec) : null
      return {
        title: sec === null ? 'Sunucu meşgul' : `Sunucu meşgul, ${sec} sn sonra yeniden denenecek`,
        detail: 'Şu anda çok fazla sahne üretiliyor.',
        retry: true,
      }
    }
    case 'timeout':
      return {
        title: 'Üretim çok uzun sürdü',
        detail: 'Sahne hazırlanmaya devam ediyor olabilir; tekrar denemek sonucu getirebilir.',
        retry: true,
      }
    default:
      return { title: 'Sahne üretilemedi', detail: 'Biraz sonra tekrar dene.', retry: true }
  }
}

/** Sahne sayfasının tam ekran hata durumu. */
export function SceneError({ kind, retryAfterSec, onRetry, onBack }: SceneErrorProps) {
  const text = sceneErrorText(kind, retryAfterSec)
  return (
    <section className="scene-error" data-kind={kind}>
      <div className="scene-error__card">
        <span className="scene-error__icon" aria-hidden="true">
          !
        </span>
        <div role="alert">
          <h2 className="scene-error__title">{text.title}</h2>
          <p className="scene-error__detail">{text.detail}</p>
        </div>
        <div className="scene-error__actions">
          {text.retry && (
            <button type="button" className="scene-error__primary" onClick={onRetry}>
              Tekrar dene
            </button>
          )}
          <button type="button" className={text.retry ? 'scene-error__secondary' : 'scene-error__primary'} onClick={onBack}>
            Haritaya dön
          </button>
        </div>
      </div>
    </section>
  )
}
