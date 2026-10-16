import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { LinearFilter, SphereGeometry, SRGBColorSpace, TextureLoader, type PerspectiveCamera, type Texture } from 'three'
import { ScenePreview } from './ScenePreview'
import {
  applyDrag,
  applyKey,
  applyPinch,
  applyWheel,
  DEFAULT_VIEW,
  FOV_DEFAULT,
  HANDLED_KEYS,
  type ViewState,
} from './viewerControls'
import './PanoramaViewer.css'

interface Props {
  src: string
  /** Panoramanın erişilebilir açıklaması (aria-label ve alt yazı). */
  alt: string
}

const DEG = Math.PI / 180
const HELP_TEXT = 'Sürükle ya da ok tuşlarını kullan; tekerlek, çimdik ya da + / - ile yakınlaş.'

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function FlatFallback({ src, alt }: Props) {
  return (
    <div className="panorama-fallback">
      <p className="panorama-notice" role="status">
        3B görüntüleme desteklenmiyor, düz önizleme gösteriliyor
      </p>
      <ScenePreview src={src} caption={alt} />
    </div>
  )
}

/** Canvas/WebGL oluşturulurken fırlatılan hatayı yakalayıp düz önizlemeye düşer. */
class RenderBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function PanoramaViewer({ src, alt }: Props) {
  const [webgl] = useState(isWebGLAvailable)
  if (!webgl) return <FlatFallback src={src} alt={alt} />
  return (
    <RenderBoundary key={src} fallback={<FlatFallback src={src} alt={alt} />}>
      <Viewer src={src} alt={alt} />
    </RenderBoundary>
  )
}

type TextureState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; texture: Texture }

function useTexture(src: string): TextureState {
  const [state, setState] = useState<TextureState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    let loaded: Texture | null = null
    new TextureLoader().load(
      src,
      (texture) => {
        if (cancelled) {
          texture.dispose()
          return
        }
        texture.colorSpace = SRGBColorSpace
        // Mipmap yok: eşit olmayan boyutlarda ve dikiş çevresinde artefakt/bellek maliyeti olmasın.
        texture.generateMipmaps = false
        texture.minFilter = LinearFilter
        texture.magFilter = LinearFilter
        loaded = texture
        setState({ status: 'ready', texture })
      },
      undefined,
      () => {
        if (!cancelled) setState({ status: 'error' })
      },
    )
    return () => {
      cancelled = true
      loaded?.dispose()
    }
  }, [src])
  return state
}

function CameraRig({ view }: { view: ViewState }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    camera.rotation.order = 'YXZ'
    camera.rotation.set(view.pitch * DEG, -view.yaw * DEG, 0)
    camera.fov = view.fov
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate, view.yaw, view.pitch, view.fov])
  return null
}

function PanoramaSphere({ texture }: { texture: Texture }) {
  // İçten bakıldığında görüntü ters çıkmasın diye x ekseni geometri düzeyinde aynalanır (yüzler içe bakar).
  const geometry = useMemo(() => new SphereGeometry(10, 64, 32).scale(-1, 1, 1), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

function Viewer({ src, alt }: Props) {
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const texture = useTexture(src)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  // Tekerlek dinleyicisi passive olmamalı ki sayfa kaymasını engelleyebilelim.
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      setView((v) => applyWheel(v, delta))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // yakalama desteklenmiyorsa sürükleme yine çalışır
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const map = pointers.current
    const prev = map.get(e.pointerId)
    if (!prev) return
    const next = { x: e.clientX, y: e.clientY }
    if (map.size === 1) {
      const height = e.currentTarget.clientHeight
      setView((v) => applyDrag(v, next.x - prev.x, next.y - prev.y, height))
    } else if (map.size === 2) {
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)?.[1]
      if (other) {
        const before = Math.hypot(prev.x - other.x, prev.y - other.y)
        const after = Math.hypot(next.x - other.x, next.y - other.y)
        if (before > 0) setView((v) => applyPinch(v, after / before))
      }
    }
    map.set(e.pointerId, next)
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!HANDLED_KEYS.includes(e.key)) return
    e.preventDefault()
    setView((v) => applyKey(v, e.key))
  }

  return (
    <figure className="scene-preview panorama-viewer">
      <div
        ref={surfaceRef}
        className="panorama-surface"
        role="application"
        aria-label={alt}
        tabIndex={0}
        data-yaw={view.yaw}
        data-pitch={view.pitch}
        data-fov={view.fov}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: FOV_DEFAULT, near: 0.1, far: 100, position: [0, 0, 0] }}
          aria-hidden="true"
        >
          <CameraRig view={view} />
          {texture.status === 'ready' && <PanoramaSphere texture={texture.texture} />}
        </Canvas>
        {texture.status === 'loading' && <p className="panorama-overlay">Panorama yükleniyor…</p>}
        {texture.status === 'error' && (
          <p className="panorama-overlay is-error" role="alert">
            Panorama yüklenemedi
          </p>
        )}
      </div>
      <p className="panorama-help">{HELP_TEXT}</p>
      <figcaption>{alt}</figcaption>
    </figure>
  )
}
