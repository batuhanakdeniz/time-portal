import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'


const h = vi.hoisted(() => ({
  loaders: {} as Record<string, { resolve: (image?: unknown) => void; reject: () => void }>,
  positionSet: vi.fn(),
  lookAt: vi.fn(),
  invalidate: vi.fn(),
  canvasThrows: false,
  setZ: vi.fn(),
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class FakeLoader {
    load(url: string, onLoad: (t: unknown) => void, _p: unknown, onError: () => void) {
      h.loaders[url] = {
        resolve: (image?: unknown) => onLoad({ dispose: vi.fn(), image: image ?? { width: 1280, height: 853 } }),
        reject: () => onError(),
      }
    }
  }
  return { ...actual, TextureLoader: FakeLoader }
})

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => {
    if (h.canvasThrows) throw new Error('WebGL context oluşturulamadı')
    return <div data-testid="canvas">{children}</div>
  },
  useThree: (select: (s: unknown) => unknown) =>
    select({
      camera: { position: { set: h.positionSet }, lookAt: h.lookAt },
      invalidate: h.invalidate,
    }),
}))

import { resetWebGLProbe } from './PanoramaViewer'
import { PhotoDepthViewer } from './PhotoDepthViewer'
import { PITCH_LIMIT, YAW_LIMIT } from './photoDepth'

const drawImage = vi.fn()
let depthPixels = true

function setWebGL(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) => {
    if (type === '2d') {
      return {
        drawImage,
        imageSmoothingQuality: 'low',
        getImageData: (_x: number, _y: number, w: number, hh: number) => {
          if (!depthPixels) throw new DOMException('tainted', 'SecurityError')
          return { data: new Uint8ClampedArray(w * hh * 4).fill(200) }
        },
      }
    }
    if (!available) return null
    return { MAX_TEXTURE_SIZE: 1, getParameter: () => 4096, getExtension: () => null }
  }) as never)
}

beforeEach(() => {
  h.loaders = {}
  h.canvasThrows = false
  h.positionSet.mockClear()
  h.lookAt.mockClear()
  h.invalidate.mockClear()
  drawImage.mockClear()
  depthPixels = true
  resetWebGLProbe()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const app = () => screen.getByRole('application', { name: '2.5 boyutlu fotoğraf görünümü' })
const renderViewer = (depthUrl: string | undefined = '/d.png') =>
  render(<PhotoDepthViewer photoUrl="/p.png" depthUrl={depthUrl} alt="Roma, 2026" />)

describe('PhotoDepthViewer', () => {
  it('WebGL yoksa düz fotoğrafa düşer ve bilgi verir', () => {
    setWebGL(false)
    renderViewer()
    expect(screen.getByText('3B görüntüleme desteklenmiyor, düz fotoğraf gösteriliyor')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Roma, 2026' })).toHaveAttribute('src', '/p.png')
    expect(screen.queryByRole('application')).not.toBeInTheDocument()
  })

  it('Canvas hata fırlatırsa düz fotoğrafa düşer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setWebGL(true)
    h.canvasThrows = true
    renderViewer()
    expect(screen.getByText('3B görüntüleme desteklenmiyor, düz fotoğraf gösteriliyor')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Roma, 2026' })).toBeInTheDocument()
  })

  it('kapsayıcı Türkçe aria-label taşır, odaklanabilir; yardım ve alt yazı gösterir', () => {
    setWebGL(true)
    renderViewer()
    expect(app()).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(/Ctrl \+ tekerlek/)).toBeInTheDocument()
    expect(screen.getByText('Roma, 2026', { selector: 'figcaption' })).toBeInTheDocument()
  })

  it('yüklenirken bilgi gösterir; ikisi de gelince kaldırır, derinlik modunda kalır', () => {
    setWebGL(true)
    renderViewer()
    expect(screen.getByText('Fotoğraf yükleniyor…')).toBeInTheDocument()
    act(() => h.loaders['/p.png'].resolve())
    expect(screen.getByText('Fotoğraf yükleniyor…')).toBeInTheDocument() // derinlik bekleniyor
    act(() => h.loaders['/d.png'].resolve())
    expect(screen.queryByText('Fotoğraf yükleniyor…')).not.toBeInTheDocument()
    expect(app()).toHaveAttribute('data-mode', 'depth')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('fotoğraf yüklenemezse role=alert ile hata gösterir', () => {
    setWebGL(true)
    renderViewer()
    act(() => h.loaders['/p.png'].reject())
    expect(screen.getByRole('alert')).toHaveTextContent('Fotoğraf yüklenemedi')
  })

  it('derinlik yüklenemezse düz fotoğraf modunda kalır ve Türkçe mesaj verir', () => {
    setWebGL(true)
    renderViewer()
    act(() => h.loaders['/p.png'].resolve())
    act(() => h.loaders['/d.png'].reject())
    expect(app()).toHaveAttribute('data-mode', 'flat')
    expect(screen.getByRole('status')).toHaveTextContent('Derinlik haritası yüklenemedi, düz fotoğraf gösteriliyor')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Fotoğraf yükleniyor…')).not.toBeInTheDocument()
  })

  it('derinlik pikselleri okunamazsa (tainted canvas) düz moda düşer', () => {
    setWebGL(true)
    depthPixels = false
    renderViewer()
    act(() => h.loaders['/p.png'].resolve())
    act(() => h.loaders['/d.png'].resolve())
    expect(app()).toHaveAttribute('data-mode', 'flat')
    expect(screen.getByRole('status')).toHaveTextContent('düz fotoğraf gösteriliyor')
  })

  it('depthUrl verilmezse düz modda açılır ve bilgi verir', () => {
    setWebGL(true)
    render(<PhotoDepthViewer photoUrl="/p.png" alt="Roma, 2026" />)
    act(() => h.loaders['/p.png'].resolve())
    expect(app()).toHaveAttribute('data-mode', 'flat')
    expect(screen.getByRole('status')).toHaveTextContent('Derinlik haritası yok, düz fotoğraf gösteriliyor')
  })

  it('fotoğraf ve derinlik yüklenince kamera yörüngeye yerleştirilir', () => {
    setWebGL(true)
    renderViewer()
    expect(h.positionSet).toHaveBeenCalled()
    expect(h.lookAt).toHaveBeenCalledWith(0, 0, 0)
  })

  it('sürükleme sınırlıdır: aşırı sürükleme ±15° / ±8°i aşmaz', () => {
    setWebGL(true)
    renderViewer()
    const el = app()
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true })
    el.setPointerCapture = () => {}
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 500, clientY: 200, button: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -90000, clientY: 90000 })
    expect(Number(el.dataset.yaw)).toBe(YAW_LIMIT)
    expect(Number(el.dataset.pitch)).toBe(PITCH_LIMIT)
  })

  it('klavye ok tuşları sınırlı döndürür, + yakınlaştırır', () => {
    setWebGL(true)
    renderViewer()
    const el = app()
    for (let i = 0; i < 30; i++) fireEvent.keyDown(el, { key: 'ArrowLeft' })
    expect(Number(el.dataset.yaw)).toBe(-YAW_LIMIT)
    fireEvent.keyDown(el, { key: '+' })
    expect(Number(el.dataset.zoom)).toBeGreaterThan(1)
  })

  it('düz tekerlek sayfayı kaydırır (engellenmez), Ctrl+tekerlek yakınlaştırır', () => {
    setWebGL(true)
    renderViewer()
    const el = app()
    const plain = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    el.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false)
    expect(Number(el.dataset.zoom)).toBe(1)
    const ctrl = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true })
    act(() => {
      el.dispatchEvent(ctrl)
    })
    expect(ctrl.defaultPrevented).toBe(true)
    expect(Number(el.dataset.zoom)).toBeGreaterThan(1)
  })

  it('fare hareketi kamera konumunu günceller (paralaks)', () => {
    setWebGL(true)
    renderViewer()
    const el = app()
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => {} })
    h.positionSet.mockClear()
    fireEvent.pointerMove(el, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 50 })
    expect(h.positionSet).toHaveBeenCalled()
    const x = h.positionSet.mock.calls.at(-1)?.[0] as number
    expect(x).toBeGreaterThan(0)
  })
})

