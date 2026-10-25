import { Component, lazy, Suspense, useState, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import type { TurkeyMap } from '../location/TurkeyMap'

type Props = ComponentProps<typeof TurkeyMap>
type Loader = () => Promise<{ default: ComponentType<Props> }>

// maplibre-gl büyük olduğu için harita ayrı parçada yüklenir; yıl ve sahne sayfaları onu indirmez.
const defaultLoader: Loader = () => import('../location/TurkeyMap').then((m) => ({ default: m.TurkeyMap }))

class ErrorBoundary extends Component<{ onRetry: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <p className="turkey-map-status turkey-map-error" role="alert">
        Harita yüklenemedi. İl ya da ilçeyi aramadan seçebilirsin.{' '}
        <button
          type="button"
          onClick={() => {
            this.props.onRetry()
            this.setState({ failed: false })
          }}
        >
          Tekrar dene
        </button>
      </p>
    )
  }
}

/** `TurkeyMap`'i tembel yükler; parça yüklenemezse arama ile seçim çalışmaya devam eder. */
export function LazyTurkeyMap({ loader = defaultLoader, ...props }: Props & { loader?: Loader }) {
  const [Map, setMap] = useState(() => lazy(loader))
  return (
    <ErrorBoundary onRetry={() => setMap(() => lazy(loader))}>
      <Suspense
        fallback={
          <p className="turkey-map-status" role="status">
            Harita yükleniyor…
          </p>
        }
      >
        <Map {...props} />
      </Suspense>
    </ErrorBoundary>
  )
}
