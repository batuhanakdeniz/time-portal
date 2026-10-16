import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const loaderState = vi.hoisted(() => ({
  mode: 'pending' as 'pending' | 'ok' | 'fail',
  textures: [] as { dispose: ReturnType<typeof vi.fn>; colorSpace?: string; generateMipmaps?: boolean }[],
  resolve: null as null | (() => void),
  reject: null as null | (() => void),
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class FakeLoader {
    load(_url: string, onLoad: (t: unknown) => void, _p: unknown, onError: () => void) {
      loaderState.resolve = () => {
        const t = { dispose: vi.fn() }
        loaderState.textures.push(t)
        onLoad(t)
      }
      loaderState.reject = () => onError()
    }
  }
  return { ...actual, TextureLoader: FakeLoader }
})

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useThree: (select: (s: unknown) => unknown) =>
    select({ camera: { rotation: { set: () => {}, order: 'XYZ' }, updateProjectionMatrix: () => {} }, invalidate: () => {} }),
}))

import { PanoramaViewer } from './PanoramaViewer'

function setWebGL(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => (available ? {} : null)) as never)
}

beforeEach(() => {
  loaderState.textures = []
  loaderState.resolve = null
  loaderState.reject = null
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const app = () => screen.getByRole('application', { name: 'Roma, 2026' })

describe('PanoramaViewer', () => {
  it('WebGL yoksa düz önizlemeye düşer ve bilgi verir', () => {
    setWebGL(false)
    render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
    expect(screen.getByText('3B görüntüleme desteklenmiyor, düz önizleme gösteriliyor')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Roma, 2026' })).toHaveAttribute('src', '/p.png')
    expect(screen.queryByRole('application')).not.toBeInTheDocument()
  })

  it('yüklenirken bilgi gösterir, doku gelince kaldırır', () => {
    setWebGL(true)
    render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
    expect(screen.getByText('Panorama yükleniyor…')).toBeInTheDocument()
    act(() => loaderState.resolve?.())
    expect(screen.queryByText('Panorama yükleniyor…')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('doku yüklenemezse role=alert ile hata gösterir', () => {
    setWebGL(true)
    render(<PanoramaViewer src="/yok.png" alt="Roma, 2026" />)
    act(() => loaderState.reject?.())
    expect(screen.getByRole('alert')).toHaveTextContent('Panorama yüklenemedi')
    expect(screen.queryByText('Panorama yükleniyor…')).not.toBeInTheDocument()
  })

  it('odaklanabilir kap alt metni etiket olarak alır, yardım ve alt yazı gösterir', () => {
    setWebGL(true)
    render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
    expect(app()).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(/ok tuşlarını kullan/)).toBeInTheDocument()
    expect(screen.getByText('Roma, 2026', { selector: 'figcaption' })).toBeInTheDocument()
  })

  it('başlangıç görünümü yaw 0, pitch 0, fov 75', () => {
    setWebGL(true)
    render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
    expect(app()).toHaveAttribute('data-yaw', '0')
    expect(app()).toHaveAttribute('data-pitch', '0')
    expect(app()).toHaveAttribute('data-fov', '75')
  })

  it('klavye yaw/pitch/FOV değiştirir; yaw sarar, sınırlar korunur', () => {
    setWebGL(true)
    render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
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
    render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
    expect(fireEvent.keyDown(app(), { key: 'a' })).toBe(true)
    expect(fireEvent.keyDown(app(), { key: 'ArrowRight' })).toBe(false)
    expect(app()).toHaveAttribute('data-yaw', '5')
  })

  it('tekerlek FOV değiştirir', () => {
    setWebGL(true)
    render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
    fireEvent.wheel(app(), { deltaY: -100 })
    expect(app()).toHaveAttribute('data-fov', '70')
  })

  it('sürükleme yaw değiştirir', () => {
    setWebGL(true)
    render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
    vi.spyOn(app(), 'clientHeight', 'get').mockReturnValue(750)
    fireEvent.pointerDown(app(), { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(app(), { pointerId: 1, clientX: 80, clientY: 100 })
    // 20 px * (75/750) = 2 derece, sola sürükleme yaw artırır
    expect(Number(app().getAttribute('data-yaw'))).toBeCloseTo(2)
    fireEvent.pointerUp(app(), { pointerId: 1 })
    fireEvent.pointerMove(app(), { pointerId: 1, clientX: 0, clientY: 100 })
    expect(Number(app().getAttribute('data-yaw'))).toBeCloseTo(2)
  })

  it('kaldırılınca dokuyu dispose eder', () => {
    setWebGL(true)
    const { unmount } = render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
    act(() => loaderState.resolve?.())
    expect(loaderState.textures).toHaveLength(1)
    const t = loaderState.textures[0]
    expect(t.colorSpace).toBe('srgb')
    expect(t.generateMipmaps).toBe(false)
    unmount()
    expect(t.dispose).toHaveBeenCalled()
  })

  it('kaldırıldıktan sonra gelen doku hemen dispose edilir', () => {
    setWebGL(true)
    const { unmount } = render(<PanoramaViewer src="/p.png" alt="Roma, 2026" />)
    const resolve = loaderState.resolve
    unmount()
    resolve?.()
    expect(loaderState.textures[0].dispose).toHaveBeenCalled()
  })
})
