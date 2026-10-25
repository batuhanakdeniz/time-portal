import { Component, useEffect, useRef, useState, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import type { TurkeyMap } from '../location/TurkeyMap'

type Props = ComponentProps<typeof TurkeyMap>
type Loader = () => Promise<ComponentType<Props>>

// maplibre-gl büyük olduğu için harita ayrı parçada yüklenir; yıl ve sahne sayfaları onu indirmez.
const defaultLoader: Loader = () => import('../location/TurkeyMap').then((m) => m.TurkeyMap)

class RenderBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; Map: ComponentType<Props> }

/**
 * `TurkeyMap`'i tembel yükler; parça yüklenemezse arama ile seçim çalışmaya devam eder.
 * Bilerek `React.lazy` + `<Suspense>` kullanılmaz: sayfa geçişi (startTransition + <ViewTransition>) içinde
 * açılan Suspense sınırının ortaya çıkışı ertelenebiliyor ve harita "yükleniyor"da kalıyordu. Parça burada
 * bir efektte indirilir ve normal bir durum güncellemesiyle çizilir.
 */
export function LazyTurkeyMap({ loader = defaultLoader, ...props }: Props & { loader?: Loader }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const loaderRef = useRef(loader)

  useEffect(() => {
    let alive = true
    loaderRef.current().then(
      (Map) => {
        if (alive) setLoad({ status: 'ready', Map })
      },
      () => {
        if (alive) setLoad({ status: 'error' })
      },
    )
    return () => {
      alive = false
    }
  }, [attempt])

  const retry = () => {
    setLoad({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  const failed = (
    <p className="turkey-map-status turkey-map-error" role="alert">
      Harita yüklenemedi. İl ya da ilçeyi aramadan seçebilirsin.{' '}
      <button type="button" onClick={retry}>
        Tekrar dene
      </button>{' '}
      ya da sayfayı yenile.
    </p>
  )

  if (load.status === 'error') return failed
  if (load.status === 'loading') {
    return (
      <p className="turkey-map-status" role="status">
        Harita yükleniyor…
      </p>
    )
  }
  const { Map } = load
  return (
    <RenderBoundary key={attempt} fallback={failed}>
      <Map {...props} />
    </RenderBoundary>
  )
}
