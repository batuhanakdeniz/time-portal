import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react'
import type { Selection } from './coordinates'

export interface PickerProps {
  value: Selection | null
  onChange: (v: Selection) => void
}

type Loader = () => Promise<{ default: ComponentType<PickerProps> }>

// maplibre-gl büyük olduğu için harita ayrı parçada yüklenir.
const defaultLoader: Loader = () => import('./LocationPicker').then((m) => ({ default: m.LocationPicker }))

class ErrorBoundary extends Component<{ onRetry: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="map-error" role="alert">
        <p>Harita yüklenemedi</p>
        <button
          type="button"
          onClick={() => {
            this.props.onRetry()
            this.setState({ failed: false })
          }}
        >
          Tekrar dene
        </button>
      </div>
    )
  }
}

/** Konum seçiciyi tembel yükler; parça yüklenemezse uygulamanın geri kalanı çalışmaya devam eder. */
export function MapSection({ value, onChange, loader = defaultLoader }: PickerProps & { loader?: Loader }) {
  const [Picker, setPicker] = useState(() => lazy(loader))
  return (
    <ErrorBoundary onRetry={() => setPicker(() => lazy(loader))}>
      <Suspense fallback={<p className="map-loading">Harita yükleniyor…</p>}>
        <Picker value={value} onChange={onChange} />
      </Suspense>
    </ErrorBoundary>
  )
}
