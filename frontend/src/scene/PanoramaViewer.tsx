import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { LinearFilter, LinearMipmapLinearFilter, SphereGeometry, SRGBColorSpace, TextureLoader, type PerspectiveCamera, type Texture } from 'three'
import { ScenePreview } from './ScenePreview'
import {
  applyDrag,
  applyKey,
  applyPinch,
  applyWheel,
  cameraRotation,
  chooseTextureWidth,
  DEFAULT_VIEW,
  FOV_DEFAULT,
  HANDLED_KEYS,
  type ViewState,
} from './viewerControls'
import './PanoramaViewer.css'
import './ViewerSection.css'

interface Props {
  src: string
  /** Panoramanın erişilebilir açıklaması (aria-label ve alt yazı). */
  alt: string
  /** false: kendi tam ekran düğmesi gösterilmez (sahne sayfasında tam ekranı SceneOverlay yönetir). */
  showFullscreenButton?: boolean
}

const HELP_TEXT = 'Sürükle ya da ok tuşlarını kullan; Ctrl + tekerlek, çimdik ya da + / - ile yakınlaş.'

interface WebGLProbe {
  available: boolean
  maxTextureSize: number
}
let probeCache: WebGLProbe | null = null

/** WebGL sondası; sonuç önbelleğe alınır ve sonda context'i hemen bırakır. */
export function probeWebGL(): WebGLProbe {
  if (probeCache) return probeCache
  let result: WebGLProbe = { available: false, maxTextureSize: 0 }
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (gl) {
      const max = typeof gl.getParameter === 'function' ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0
      result = { available: true, maxTextureSize: Number.isFinite(max) && max > 0 ? max : 4096 }
      gl.getExtension?.('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    // sonda başarısız: WebGL yok say
  }
  probeCache = result
  return result
}

export function isWebGLAvailable(): boolean {
  return probeWebGL().available
}

/** Yalnızca testler için. */
export function resetWebGLProbe() {
  probeCache = null
}

function isMobileDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  } catch {
    return false
  }
}

/** Görüntü hedef genişlikten büyükse 2:1 oranını koruyarak küçültür (canvas; flipY ile uyumlu). */
function downscale(image: { width: number; height: number }, width: number): unknown {
  if (image.width <= width) return image
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(1, Math.round((image.height * width) / image.width))
  const ctx = canvas.getContext('2d')
  if (!ctx) return image
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height)
  return canvas
}

type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void }

function fullscreenSupported(): boolean {
  const el = document.documentElement as FullscreenEl
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'
}

function currentFullscreenElement(): Element | null {
  const d = document as FullscreenDoc
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
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

export function PanoramaViewer({ src, alt, showFullscreenButton = true }: Props) {
  const [webgl] = useState(isWebGLAvailable)
  if (!webgl) return <FlatFallback src={src} alt={alt} />
  return (
    <RenderBoundary key={src} fallback={<FlatFallback src={src} alt={alt} />}>
      <Viewer src={src} alt={alt} showFullscreenButton={showFullscreenButton} />
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
        const image = texture.image as { width?: number; height?: number } | undefined
        if (image?.width && image.height) {
          const width = chooseTextureWidth(image.width, probeWebGL().maxTextureSize || 4096, isMobileDevice())
          texture.image = downscale(image as { width: number; height: number }, width) as HTMLImageElement
        }
        texture.colorSpace = SRGBColorSpace
        // WebGL2'de 2'nin kuvveti şartı yok; mipmap uzaktan görünümde titremeyi azaltır.
        texture.generateMipmaps = true
        texture.minFilter = LinearMipmapLinearFilter
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
    const r = cameraRotation(view)
    camera.rotation.set(r.x, r.y, 0)
    camera.fov = view.fov
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate, view])
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

function Viewer({ src, alt, showFullscreenButton = true }: Props) {
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const texture = useTexture(src)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const [fsSupported] = useState(fullscreenSupported)
  const [fullscreen, setFullscreen] = useState(false)

  // Tekerlek dinleyicisi passive olmamalı ki Ctrl+tekerlekte sayfa yakınlaşmasını engelleyebilelim.
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Düz tekerlek sayfayı kaydırır; Ctrl/⌘ (ve trackpad çimdiği, ctrlKey'li gelir) yakınlaştırır.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      setView((v) => applyWheel(v, delta))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const sync = () => setFullscreen(!!surfaceRef.current && currentFullscreenElement() === surfaceRef.current)
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const toggleFullscreen = () => {
    const el = surfaceRef.current as FullscreenEl | null
    if (!el) return
    const d = document as FullscreenDoc
    if (currentFullscreenElement()) {
      void (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.())
    } else {
      void (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.())
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
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
    // Ctrl/⌘/Alt'li kombinasyonlar tarayıcıya aittir (tarayıcı yakınlaştırması, geri gitme).
    if (e.ctrlKey || e.metaKey || e.altKey) return
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
        onLostPointerCapture={onPointerEnd}
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
        {fsSupported && showFullscreenButton && (
          <button
            type="button"
            className="panorama-fullscreen"
            aria-pressed={fullscreen}
            onClick={toggleFullscreen}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
          </button>
        )}
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
