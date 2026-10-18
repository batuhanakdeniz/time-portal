import { Component, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  type PerspectiveCamera,
  type Texture,
} from 'three'
import { isWebGLAvailable } from './PanoramaViewer'
import {
  applyPhotoDrag,
  applyPhotoKey,
  applyPhotoPinch,
  applyPhotoWheel,
  buildDisplacement,
  cameraDistance,
  chooseGridSize,
  DEFAULT_PHOTO_VIEW,
  effectiveRotation,
  orbitPosition,
  overscanScale,
  PHOTO_HANDLED_KEYS,
  smoothToward,
  type PhotoView,
} from './photoDepth'
import './PanoramaViewer.css'
import './ViewerSection.css'

interface Props {
  photoUrl: string
  /** Gri tonlu derinlik haritası (açık = yakın). Yoksa ya da yüklenemezse düz fotoğraf gösterilir. */
  depthUrl?: string
  /** Fotoğrafın erişilebilir açıklaması (alt yazı). */
  alt?: string
}

const FOV = 45
const DEFAULT_ALT = 'Fotoğraf'
const ARIA_LABEL = '2.5 boyutlu fotoğraf görünümü'
const HELP_TEXT = 'Sürükle ya da ok tuşlarını kullan; Ctrl + tekerlek, çimdik ya da + / - ile yakınlaş.'
const DEPTH_MESSAGE = 'Derinlik haritası yüklenemedi, düz fotoğraf gösteriliyor'
const NO_DEPTH_MESSAGE = 'Derinlik haritası yok, düz fotoğraf gösteriliyor'
const WEBGL_MESSAGE = '3B görüntüleme desteklenmiyor, düz fotoğraf gösteriliyor'
const RENDER_ERROR_MESSAGE = '3B görünüm açılamadı, düz fotoğraf gösteriliyor'

function isMobileDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  } catch {
    return false
  }
}

function FlatFallback({ photoUrl, alt, message }: { photoUrl: string; alt: string; message: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <figure className="scene-preview panorama-fallback">
      <p className="panorama-notice" role="status">
        {message}
      </p>
      {failed ? (
        <p className="preview-error" role="alert">
          Fotoğraf yüklenemedi
        </p>
      ) : (
        <img src={photoUrl} alt={alt} onError={() => setFailed(true)} />
      )}
      <figcaption>{alt}</figcaption>
    </figure>
  )
}

/** Canvas/WebGL oluşturulurken fırlatılan hatayı yakalayıp düz fotoğrafa düşer. */
class RenderBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('PhotoDepthViewer: 3B görünüm açılamadı', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function PhotoDepthViewer({ photoUrl, depthUrl, alt = DEFAULT_ALT }: Props) {
  const [webgl] = useState(isWebGLAvailable)
  if (!webgl) return <FlatFallback photoUrl={photoUrl} alt={alt} message={WEBGL_MESSAGE} />
  return (
    <RenderBoundary
      key={`${photoUrl}|${depthUrl ?? ''}`}
      fallback={<FlatFallback photoUrl={photoUrl} alt={alt} message={RENDER_ERROR_MESSAGE} />}
    >
      <Viewer photoUrl={photoUrl} depthUrl={depthUrl} alt={alt} />
    </RenderBoundary>
  )
}

type TextureState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; texture: Texture }

function useTexture(url: string | undefined, srgb: boolean): TextureState {
  const [state, setState] = useState<TextureState>(url ? { status: 'loading' } : { status: 'error' })
  useEffect(() => {
    if (!url) return
    let cancelled = false
    let loaded: Texture | null = null
    new TextureLoader().load(
      url,
      (texture) => {
        if (cancelled) {
          texture.dispose()
          return
        }
        if (srgb) texture.colorSpace = SRGBColorSpace
        // WebGL2'de 2'nin kuvveti şartı yok; fotoğrafta mipmap küçültmede titremeyi azaltır, derinlik yalnızca örneklenir.
        texture.generateMipmaps = srgb
        texture.minFilter = srgb ? LinearMipmapLinearFilter : LinearFilter
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
  }, [url, srgb])
  return url ? state : { status: 'error' }
}

/** Derinlik görüntüsünü (cols+1)x(rows+1)'e küçültüp kırmızı kanalı döndürür; başarısızsa null. */
function sampleDepth(image: unknown, cols: number, rows: number): Uint8Array | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = cols + 1
    canvas.height = rows + 1
    const ctx = canvas.getContext('2d')
    if (!ctx || !image) return null
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const out = new Uint8Array(canvas.width * canvas.height)
    for (let i = 0; i < out.length; i++) out[i] = data[i * 4]
    return out
  } catch {
    return null
  }
}

function imageAspect(texture: Texture | null): number {
  const image = texture?.image as { width?: number; height?: number } | undefined
  return image?.width && image.height ? image.width / image.height : 1.5
}

interface RigProps {
  view: PhotoView
  /** Normalleştirilmiş fare konumu; ref'te tutulur, her harekette React yeniden render etmez. */
  pointerRef: MutableRefObject<{ x: number; y: number }>
  /** Sürükleme sırasında paralaks devre dışı: sürükleme ve paralaks ters yönde çekmesin. */
  draggingRef: MutableRefObject<boolean>
  /** Canvas içindeki invalidate'i dışarıya açar (talep üzerine render). */
  kickRef: MutableRefObject<(() => void) | null>
}

function CameraRig({ view, pointerRef, draggingRef, kickRef }: RigProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const viewRef = useRef(view)
  const smooth = useRef({ x: 0, y: 0 })
  useLayoutEffect(() => {
    kickRef.current = invalidate
    return () => {
      kickRef.current = null
    }
  }, [invalidate, kickRef])
  useLayoutEffect(() => {
    viewRef.current = view
    invalidate()
  }, [view, invalidate])
  useFrame((state, delta) => {
    const target = draggingRef.current ? { x: 0, y: 0 } : pointerRef.current
    const s = smooth.current
    s.x = smoothToward(s.x, target.x, delta)
    s.y = smoothToward(s.y, target.y, delta)
    const v = viewRef.current
    const r = effectiveRotation(v, s)
    const [x, y, z] = orbitPosition(r.yaw, r.pitch, cameraDistance(FOV, v.zoom))
    camera.position.set(x, y, z)
    camera.lookAt(0, 0, 0)
    if (s.x !== target.x || s.y !== target.y) state.invalidate()
  })
  return null
}

function PhotoPlane({
  texture,
  aspect,
  cols,
  rows,
  depth,
  scale,
}: {
  texture: Texture
  aspect: number
  cols: number
  rows: number
  depth: Uint8Array | null
  scale: number
}) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(2 * aspect, 2, cols, rows)
    if (depth) {
      const z = buildDisplacement(depth, cols, rows)
      for (let i = 0; i < z.length; i++) g.attributes.position.setZ(i, z[i])
      g.attributes.position.needsUpdate = true
    }
    return g
  }, [aspect, cols, rows, depth])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} scale={[scale, scale, scale]}>
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

function Viewer({ photoUrl, depthUrl, alt }: Required<Pick<Props, 'photoUrl' | 'alt'>> & Pick<Props, 'depthUrl'>) {
  const [view, setView] = useState<PhotoView>(DEFAULT_PHOTO_VIEW)
  const pointerRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const kickRef = useRef<(() => void) | null>(null)
  const photo = useTexture(photoUrl, true)
  const depthTex = useTexture(depthUrl, false)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const [mobile] = useState(isMobileDevice)
  const helpId = useId()

  const photoReady = photo.status === 'ready'
  const aspect = imageAspect(photoReady ? photo.texture : null)
  const { cols, rows } = useMemo(() => chooseGridSize(aspect, mobile), [aspect, mobile])
  const scale = useMemo(() => overscanScale(FOV, aspect), [aspect])
  // Izgara fotoğraf boyutu bilinince kesinleşir; ondan önce örnekleme yapılmaz (iki kez örnekleme olmasın).
  const depth = useMemo(
    () => (photoReady && depthTex.status === 'ready' ? sampleDepth(depthTex.texture.image, cols, rows) : null),
    [photoReady, depthTex, cols, rows],
  )

  const depthPending = !!depthUrl && (depthTex.status === 'loading' || photo.status === 'loading')
  const flatMode = !depthPending && depth === null
  const flatMessage = !depthUrl ? NO_DEPTH_MESSAGE : DEPTH_MESSAGE

  // Tekerlek dinleyicisi passive olmamalı ki Ctrl+tekerlekte sayfa yakınlaşmasını engelleyebilelim.
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Düz tekerlek sayfayı kaydırır; Ctrl/⌘ (ve trackpad çimdiği, ctrlKey'li gelir) yakınlaştırır.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      setView((v) => applyPhotoWheel(v, delta))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // yakalama desteklenmiyorsa sürükleme yine çalışır
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    draggingRef.current = true
    kickRef.current?.()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // currentTarget olay işleyicisi dışında null olur: değerleri burada senkron oku.
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const height = el.clientHeight
    if (e.pointerType === 'mouse' && rect.width > 0 && rect.height > 0) {
      pointerRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      }
      kickRef.current?.()
    }
    const map = pointers.current
    const prev = map.get(e.pointerId)
    if (!prev) return
    const next = { x: e.clientX, y: e.clientY }
    if (map.size === 1) {
      setView((v) => applyPhotoDrag(v, next.x - prev.x, next.y - prev.y, height))
    } else if (map.size === 2) {
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)?.[1]
      if (other) {
        const before = Math.hypot(prev.x - other.x, prev.y - other.y)
        const after = Math.hypot(next.x - other.x, next.y - other.y)
        if (before > 0) setView((v) => applyPhotoPinch(v, after / before))
      }
    }
    map.set(e.pointerId, next)
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    draggingRef.current = pointers.current.size > 0
    kickRef.current?.()
  }

  const onPointerLeave = () => {
    pointerRef.current = { x: 0, y: 0 }
    kickRef.current?.()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ctrl/⌘/Alt'li kombinasyonlar tarayıcıya aittir (tarayıcı yakınlaştırması, geri gitme).
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (!PHOTO_HANDLED_KEYS.includes(e.key)) return
    e.preventDefault()
    setView((v) => applyPhotoKey(v, e.key))
  }

  return (
    <figure className="scene-preview panorama-viewer">
      <div
        ref={surfaceRef}
        className="panorama-surface"
        style={{ aspectRatio: String(aspect) }}
        role="application"
        aria-label={`${ARIA_LABEL}: ${alt}`}
        aria-describedby={helpId}
        tabIndex={0}
        data-yaw={view.yaw}
        data-pitch={view.pitch}
        data-zoom={view.zoom}
        data-mode={flatMode ? 'flat' : 'depth'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerLeave}
        onLostPointerCapture={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: FOV, near: 0.1, far: 100, position: [0, 0, 5] }} aria-hidden="true">
          <CameraRig view={view} pointerRef={pointerRef} draggingRef={draggingRef} kickRef={kickRef} />
          {photo.status === 'ready' && !depthPending && (
            <PhotoPlane texture={photo.texture} aspect={aspect} cols={cols} rows={rows} depth={depth} scale={scale} />
          )}
        </Canvas>
        {(photo.status === 'loading' || depthPending) && (
          <p className="panorama-overlay" role="status">
            Fotoğraf yükleniyor…
          </p>
        )}
        {photo.status === 'error' && (
          <p className="panorama-overlay is-error" role="alert">
            Fotoğraf yüklenemedi
          </p>
        )}
      </div>
      {flatMode && photo.status === 'ready' && (
        <p className="panorama-notice" role="status">
          {flatMessage}
        </p>
      )}
      <p id={helpId} className="panorama-help">
        {HELP_TEXT}
      </p>
      <figcaption>{alt}</figcaption>
    </figure>
  )
}
