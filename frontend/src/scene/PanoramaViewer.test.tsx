import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

type FakeTexture = {
  dispose: ReturnType<typeof vi.fn>
  colorSpace?: string
  generateMipmaps?: boolean
  minFilter?: number
  image?: unknown
}

const h = vi.hoisted(() => ({
  textures: [] as FakeTexture[],
  nextImage: undefined as unknown,
  resolve: null as null | (() => void),
  reject: null as null | (() => void),
  rotationSet: vi.fn(),
  invalidate: vi.fn(),
  canvasThrows: false,
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class FakeLoader {
    load(_url: string, onLoad: (t: unknown) => void, _p: unknown, onError: () => void) {
      h.resolve = () => {
        const t: FakeTexture = { dispose: vi.fn(), image: h.nextImage }
        h.textures.push(t)
        onLoad(t)
      }
      h.reject = () => onError()
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
      camera: { rotation: { set: h.rotationSet, order: 'XYZ' }, updateProjectionMatrix: () => {}, fov: 75 },
      invalidate: h.invalidate,
    }),
}))

import { PanoramaViewer, resetWebGLProbe } from './PanoramaViewer'

const loseContext = vi.fn()
const drawImage = vi.fn()

function setWebGL(available: boolean, maxTextureSize = 16384) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) => {
    if (type === '2d') return { drawImage, imageSmoothingQuality: 'low' }
    if (!available) return null
    return {
      MAX_TEXTURE_SIZE: 1,
      getParameter: () => maxTextureSize,
      getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext } : null),
    }
  }) as never)
}

beforeEach(() => {
  h.textures = []
  h.nextImage = undefined
  h.resolve = null
  h.reject = null
  h.canvasThrows = false
  h.rotationSet.mockClear()
  h.invalidate.mockClear()
  loseContext.mockClear()
  drawImage.mockClear()
  resetWebGLProbe()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen
})

const app = () => screen.getByRole('application', { name: 'Roma, 2026' })
const renderViewer = () => render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)

describe('PanoramaViewer', () => {
  it('WebGL yoksa düz önizlemeye düşer ve bilgi verir', () => {
    setWebGL(false)
    renderViewer()
    expect(screen.getByText('3B görüntüleme desteklenmiyor, düz önizleme gösteriliyor')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Roma, 2026' })).toHaveAttribute('src', '/p.png')
    expect(screen.queryByRole('application')).not.toBeInTheDocument()
  })

  it('Canvas hata fırlatırsa düz önizlemeye düşer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setWebGL(true)
    h.canvasThrows = true
    renderViewer()
    expect(screen.getByText('3B görüntüleme desteklenmiyor, düz önizleme gösteriliyor')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Roma, 2026' })).toBeInTheDocument()
  })

  it('WebGL sondası önbelleğe alınır ve context bırakılır', () => {
    setWebGL(true)
    const spy = vi.spyOn(document, 'createElement')
    const first = renderViewer()
    first.unmount()
    renderViewer()
    expect(loseContext).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls.filter(([t]) => t === 'canvas')).toHaveLength(1)
  })

  it('yüklenirken bilgi gösterir, doku gelince kaldırır', () => {
    setWebGL(true)
    renderViewer()
    expect(screen.getByText('Panorama yükleniyor…')).toBeInTheDocument()
    act(() => h.resolve?.())
    expect(screen.queryByText('Panorama yükleniyor…')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('doku yüklenemezse role=alert ile hata gösterir', () => {
    setWebGL(true)
    renderViewer()
    act(() => h.reject?.())
    expect(screen.getByRole('alert')).toHaveTextContent('Panorama yüklenemedi')
    expect(screen.queryByText('Panorama yükleniyor…')).not.toBeInTheDocument()
  })

  it('odaklanabilir kap alt metni etiket olarak alır, yardım ve alt yazı gösterir', () => {
    setWebGL(true)
    renderViewer()
    expect(app()).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(/Ctrl \+ tekerlek/)).toBeInTheDocument()
    expect(screen.getByText('Roma, 2026', { selector: 'figcaption' })).toBeInTheDocument()
  })

  it('başlangıç görünümü yaw 0, pitch 0, fov 75 ve kamera ilk bakışı panoramanın ortasına çevirir', () => {
    setWebGL(true)
    renderViewer()
    expect(app()).toHaveAttribute('data-yaw', '0')
    expect(app()).toHaveAttribute('data-pitch', '0')
    expect(app()).toHaveAttribute('data-fov', '75')
    const [x, y, z] = h.rotationSet.mock.calls.at(-1)!
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(Math.PI / 2) // yaw 0 + (-90°) ofset => kamera -x'e (u=0.5) bakar
    expect(z).toBe(0)
    expect(h.invalidate).toHaveBeenCalled()
  })

  it('görünüm değişince kamera dönüşü güncellenir ve yeniden çizim istenir', () => {
    setWebGL(true)
    renderViewer()
    h.invalidate.mockClear()
    fireEvent.keyDown(app(), { key: 'ArrowRight' })
    fireEvent.keyDown(app(), { key: 'ArrowUp' })
    const [x, y] = h.rotationSet.mock.calls.at(-1)!
    expect(x).toBeCloseTo((5 * Math.PI) / 180)
    expect(y).toBeCloseTo(((90 - 5) * Math.PI) / 180)
    expect(h.invalidate).toHaveBeenCalledTimes(2)
  })

  it('klavye yaw/pitch/FOV değiştirir; yaw sarar, sınırlar korunur', () => {
    setWebGL(true)
    renderViewer()
    fireEvent.keyDown(app(), { key: 'ArrowRight' })
    expect(app()).toHaveAttribute('data-yaw', '5')
    fireEvent.keyDown(app(), { key: 'ArrowLeft' })
    fireEvent.keyDown(app(), { key: 'ArrowLeft' })
    expect(app()).toHaveAttribute('data-yaw', '355')
    fireEvent.keyDown(app(), { key: 'ArrowUp' })
    expect(app()).toHaveAttribute('data-pitch', '5')
    for (let i = 0; i < 30; i++) fireEvent.keyDown(app(), { key: 'ArrowUp' })
    expect(app()).toHaveAttribute('data-pitch', '85')
    fireEvent.keyDown(app(), { key: '+' })
    expect(app()).toHaveAttribute('data-fov', '70')
    for (let i = 0; i < 30; i++) fireEvent.keyDown(app(), { key: '-' })
    expect(app()).toHaveAttribute('data-fov', '90')
  })

  it('ilgisiz tuşları yok sayar ve varsayılanı engellemez', () => {
    setWebGL(true)
    renderViewer()
    expect(fireEvent.keyDown(app(), { key: 'a' })).toBe(true)
    expect(fireEvent.keyDown(app(), { key: 'ArrowRight' })).toBe(false)
    expect(app()).toHaveAttribute('data-yaw', '5')
  })

  it('Ctrl/Cmd/Alt ile +, -, = tarayıcıya bırakılır', () => {
    setWebGL(true)
    renderViewer()
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      for (const key of ['+', '-', '=']) {
        expect(fireEvent.keyDown(app(), { key, ...mod })).toBe(true)
      }
    }
    expect(app()).toHaveAttribute('data-fov', '75')
  })

  it('düz tekerlek sayfayı kaydırır: engellenmez, FOV değişmez', () => {
    setWebGL(true)
    renderViewer()
    const notPrevented = fireEvent.wheel(app(), { deltaY: -100 })
    expect(notPrevented).toBe(true)
    expect(app()).toHaveAttribute('data-fov', '75')
  })

  it('Ctrl+tekerlek (ve ⌘, trackpad çimdiği) FOV değiştirir ve varsayılanı engeller', () => {
    setWebGL(true)
    renderViewer()
    expect(fireEvent.wheel(app(), { deltaY: -100, ctrlKey: true })).toBe(false)
    const zoomedIn = Number(app().getAttribute('data-fov'))
    expect(zoomedIn).toBeLessThan(75)
    expect(fireEvent.wheel(app(), { deltaY: 100, metaKey: true })).toBe(false)
    expect(Number(app().getAttribute('data-fov'))).toBeGreaterThan(zoomedIn)
  })

  it('sürükleme yaw değiştirir; bırakınca durur', () => {
    setWebGL(true)
    renderViewer()
    vi.spyOn(app(), 'clientHeight', 'get').mockReturnValue(750)
    fireEvent.pointerDown(app(), { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(app(), { pointerId: 1, clientX: 80, clientY: 100 })
    // 20 px * (75/750) = 2 derece, sola sürükleme yaw artırır
    expect(Number(app().getAttribute('data-yaw'))).toBeCloseTo(2)
    fireEvent.pointerUp(app(), { pointerId: 1 })
    fireEvent.pointerMove(app(), { pointerId: 1, clientX: 0, clientY: 100 })
    expect(Number(app().getAttribute('data-yaw'))).toBeCloseTo(2)
  })

  it('pointer yakalama kaybolunca sürükleme biter', () => {
    setWebGL(true)
    renderViewer()
    vi.spyOn(app(), 'clientHeight', 'get').mockReturnValue(750)
    fireEvent.pointerDown(app(), { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.lostPointerCapture(app(), { pointerId: 1 })
    fireEvent.pointerMove(app(), { pointerId: 1, clientX: 0, clientY: 100 })
    expect(app()).toHaveAttribute('data-yaw', '0')
  })

  it('farede ana düğme dışındaki tuşlarla sürükleme başlamaz', () => {
    setWebGL(true)
    renderViewer()
    vi.spyOn(app(), 'clientHeight', 'get').mockReturnValue(750)
    fireEvent.pointerDown(app(), { pointerId: 1, pointerType: 'mouse', button: 2, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(app(), { pointerId: 1, clientX: 0, clientY: 100 })
    expect(app()).toHaveAttribute('data-yaw', '0')
  })

  it('iki pointer ile çimdik FOV değiştirir', () => {
    setWebGL(true)
    renderViewer()
    fireEvent.pointerDown(app(), { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerDown(app(), { pointerId: 2, clientX: 100, clientY: 0 })
    fireEvent.pointerMove(app(), { pointerId: 2, clientX: 200, clientY: 0 })
    expect(Number(app().getAttribute('data-fov'))).toBeCloseTo(37.5)
    expect(app()).toHaveAttribute('data-yaw', '0')
    fireEvent.pointerMove(app(), { pointerId: 2, clientX: 100, clientY: 0 })
    expect(Number(app().getAttribute('data-fov'))).toBeCloseTo(75)
  })

  it('kaldırılınca dokuyu dispose eder; mipmap açık, sRGB', () => {
    setWebGL(true)
    const { unmount } = renderViewer()
    act(() => h.resolve?.())
    expect(h.textures).toHaveLength(1)
    const t = h.textures[0]
    expect(t.colorSpace).toBe('srgb')
    expect(t.generateMipmaps).toBe(true)
    unmount()
    expect(t.dispose).toHaveBeenCalled()
  })

  it('kaldırıldıktan sonra gelen doku hemen dispose edilir', () => {
    setWebGL(true)
    const { unmount } = renderViewer()
    const resolve = h.resolve
    unmount()
    resolve?.()
    expect(h.textures[0].dispose).toHaveBeenCalled()
  })

  it('büyük görüntü GPU sınırına göre 2:1 oranla küçültülür', () => {
    setWebGL(true, 2048)
    h.nextImage = { width: 8192, height: 4096 }
    renderViewer()
    act(() => h.resolve?.())
    const img = h.textures[0].image as HTMLCanvasElement
    expect(img.width).toBe(2048)
    expect(img.height).toBe(1024)
    expect(drawImage).toHaveBeenCalledTimes(1)
  })

  it('sınır altındaki görüntü olduğu gibi kalır', () => {
    setWebGL(true)
    const image = { width: 1024, height: 512 }
    h.nextImage = image
    renderViewer()
    act(() => h.resolve?.())
    expect(h.textures[0].image).toBe(image)
    expect(drawImage).not.toHaveBeenCalled()
  })

  it('mobilde 4096 üstü küçültülür', () => {
    setWebGL(true, 16384)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    h.nextImage = { width: 8192, height: 4096 }
    renderViewer()
    act(() => h.resolve?.())
    expect((h.textures[0].image as HTMLCanvasElement).width).toBe(4096)
  })
})

describe('tam ekran düğmesi', () => {
  it('API yoksa düğme gösterilmez', () => {
    setWebGL(true)
    renderViewer()
    expect(screen.queryByRole('button', { name: 'Tam ekran' })).not.toBeInTheDocument()
  })

  it('API varsa tam ekran ister, değişince etiket ve aria-pressed güncellenir, tekrar basınca çıkar', () => {
    setWebGL(true)
    const request = vi.fn().mockResolvedValue(undefined)
    const exit = vi.fn().mockResolvedValue(undefined)
    ;(document.documentElement as unknown as { requestFullscreen: unknown }).requestFullscreen = request
    ;(HTMLElement.prototype as unknown as { requestFullscreen: unknown }).requestFullscreen = request
    ;(document as unknown as { exitFullscreen: unknown }).exitFullscreen = exit
    try {
      renderViewer()
      const btn = screen.getByRole('button', { name: 'Tam ekran' })
      expect(btn).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(btn)
      expect(request).toHaveBeenCalledTimes(1)

      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => app() })
      fireEvent(document, new Event('fullscreenchange'))
      const exitBtn = screen.getByRole('button', { name: 'Tam ekrandan çık' })
      expect(exitBtn).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(exitBtn)
      expect(exit).toHaveBeenCalledTimes(1)

      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null })
      fireEvent(document, new Event('fullscreenchange'))
      expect(screen.getByRole('button', { name: 'Tam ekran' })).toHaveAttribute('aria-pressed', 'false')
    } finally {
      delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen
      delete (document as { exitFullscreen?: unknown }).exitFullscreen
      delete (document as { fullscreenElement?: unknown }).fullscreenElement
    }
  })

  it('düğmeye basmak sürüklemeyi başlatmaz', () => {
    setWebGL(true)
    ;(document.documentElement as unknown as { requestFullscreen: unknown }).requestFullscreen = vi.fn()
    renderViewer()
    vi.spyOn(app(), 'clientHeight', 'get').mockReturnValue(750)
    const btn = screen.getByRole('button', { name: 'Tam ekran' })
    fireEvent.pointerDown(btn, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(app(), { pointerId: 1, clientX: 0, clientY: 100 })
    expect(app()).toHaveAttribute('data-yaw', '0')
  })
})
