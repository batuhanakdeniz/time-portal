import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { ScenePreview } from './ScenePreview'

export interface ViewerProps {
  src: string
  alt: string
}

type Loader = () => Promise<{ default: ComponentType<ViewerProps> }>

// three + react-three-fiber büyük olduğu için görüntüleyici ayrı parçada yüklenir.
const defaultLoader: Loader = () => import('./PanoramaViewer').then((m) => ({ default: m.PanoramaViewer }))
const DefaultViewer = lazy(defaultLoader)

class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** 360° görüntüleyiciyi tembel yükler; parça yüklenemezse düz önizlemeye düşer. */
export function ViewerSection({ src, alt, loader }: ViewerProps & { loader?: Loader }) {
  // Her bileşen örneği için tek lazy bileşeni; loader yalnızca test içindir.
  const Viewer = loader ? lazyFor(loader) : DefaultViewer
  return (
    <ErrorBoundary key={src} fallback={<ScenePreview src={src} caption={alt} />}>
      <Suspense fallback={<p className="preview-loading">3B görüntüleyici yükleniyor…</p>}>
        <Viewer src={src} alt={alt} />
      </Suspense>
    </ErrorBoundary>
  )
}

const lazyCache = new WeakMap<Loader, ReturnType<typeof lazy<ComponentType<ViewerProps>>>>()
function lazyFor(loader: Loader) {
  let c = lazyCache.get(loader)
  if (!c) {
    c = lazy(loader)
    lazyCache.set(loader, c)
  }
  return c
}
