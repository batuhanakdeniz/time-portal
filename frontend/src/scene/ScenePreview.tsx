import { useState } from 'react'

interface Props {
  src: string
  caption: string
}

type LoadState = 'loading' | 'loaded' | 'error'

/** Düz görsel önizlemesi: WebGL yoksa (`PanoramaViewer`) ya da görüntüleyici parçası yüklenemezse (`ViewerSection`) yedek. */
export function ScenePreview({ src, caption }: Props) {
  // key={src} ile adres değişince yükleme durumu sıfırlanır
  return <PreviewImage key={src} src={src} caption={caption} />
}

function PreviewImage({ src, caption }: Props) {
  const [state, setState] = useState<LoadState>('loading')
  return (
    <figure className="scene-preview">
      {state === 'error' ? (
        <p className="preview-error" role="alert">
          Panorama yüklenemedi
        </p>
      ) : (
        <img
          src={src}
          alt={caption}
          className={state === 'loading' ? 'is-loading' : undefined}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      )}
      {state === 'loading' && <p className="preview-loading">Panorama yükleniyor…</p>}
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
