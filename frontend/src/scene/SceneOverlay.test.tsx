import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SceneAttribution, ScenePeriod } from '../api/scenes'
import {
  attributionLine,
  overlayPlaceShort,
  overlayPlaceTitle,
  SceneOverlay,
  sceneYearNote,
  type SceneOverlayProps,
} from './SceneOverlay'

const OTTOMAN: ScenePeriod = { id: 'osmanli-klasik', name: 'Osmanlı klasik', yearFrom: 1453, yearTo: 1700, confidence: 'yorum' }
const TODAY: ScenePeriod = { id: 'bugun', name: 'Bugün', yearFrom: 2000, yearTo: 2030, confidence: 'gercek' }
const ATTR: SceneAttribution = {
  author: 'Ad Soyad',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sourceUrl: null,
  provider: 'mapillary',
}

function renderOverlay(props: Partial<SceneOverlayProps> = {}) {
  const onBack = vi.fn()
  const onShare = vi.fn()
  const view = render(
    <SceneOverlay
      year={1453}
      place={{ province: 'İstanbul', district: 'Beyoğlu' }}
      period={OTTOMAN}
      kind="panorama"
      attribution={ATTR}
      onBack={onBack}
      onShare={onShare}
      shareUrl="https://example.test/yil/1453/yer/34-beyoglu/sahne"
      {...props}
    />,
  )
  const root = view.container.querySelector('.scene-overlay') as HTMLElement
  return { ...view, root, onBack, onShare }
}

/** Görüntüleyiciye (katman dışına) dokunuş. */
function tapScene(x = 200, y = 300) {
  fireEvent.pointerDown(document.body, { pointerId: 1, clientX: x, clientY: y, button: 0 })
  fireEvent.pointerUp(document.body, { pointerId: 1, clientX: x, clientY: y, button: 0 })
}

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('metin yardımcıları', () => {
  it('yer başlığı ve kısa ad', () => {
    expect(overlayPlaceTitle({ province: 'İstanbul', district: 'Beyoğlu' })).toBe('Beyoğlu, İstanbul')
    expect(overlayPlaceTitle({ province: 'Hakkari', district: 'Merkez' })).toBe('Hakkari Merkez')
    expect(overlayPlaceTitle({ province: 'İstanbul' })).toBe('İstanbul')
    expect(overlayPlaceShort({ province: 'İstanbul', district: 'Beyoğlu' })).toBe('Beyoğlu')
    expect(overlayPlaceShort({ province: 'Hakkari', district: 'Merkez' })).toBe('Hakkari Merkez')
    expect(overlayPlaceShort({ province: 'İstanbul', district: null })).toBe('İstanbul')
  })

  it('dönem notu FAZ3 §2 MVP kuralına uyar', () => {
    expect(sceneYearNote(1453, OTTOMAN)).toBe('1453 seçildi · Şimdilik 2026 görünümü; Osmanlı klasik sahnesi hazırlanıyor')
    expect(sceneYearNote(2026, TODAY)).toBe('2026 görünümü')
    expect(sceneYearNote(2010, TODAY)).toBe('2010 seçildi · 2026 görünümü')
    expect(sceneYearNote(2026, null)).toBe('2026 görünümü')
    expect(sceneYearNote(1453)).toBe('1453 seçildi · 2026 görünümü')
    expect(sceneYearNote(-1200, { id: 'demir', name: 'Demir Çağı', yearFrom: -1200, yearTo: -550, confidence: 'yorum' })).toBe(
      'MÖ 1200 seçildi · Şimdilik 2026 görünümü; Demir Çağı sahnesi hazırlanıyor',
    )
  })

  it('tek satır atıf', () => {
    expect(attributionLine(ATTR)).toBe('Görsel: Ad Soyad · CC BY-SA 4.0 · Mapillary')
    expect(attributionLine({ ...ATTR, author: null, license: null, provider: 'wikimedia-commons' })).toBe('Görsel: Wikimedia Commons')
    expect(attributionLine(null)).toBe('Harita verisi © OpenStreetMap katkıcıları')
  })
})

describe('SceneOverlay üst katman', () => {
  it('başlık, yıl/dönem notu, not çipi ve rozet', () => {
    renderOverlay()
    expect(screen.getByRole('heading', { name: 'Beyoğlu, İstanbul' })).toBeInTheDocument()
    expect(screen.getByText('1453 seçildi · Şimdilik 2026 görünümü; Osmanlı klasik sahnesi hazırlanıyor')).toBeInTheDocument()
    expect(screen.getByText('Yapay zekâ yorumu değil: 2026 fotoğrafı + derinlik')).toBeInTheDocument()
    expect(screen.getByText('360°')).toBeInTheDocument()
  })

  it('fotoğraf sahnesinde 2.5B rozeti', () => {
    renderOverlay({ kind: 'photo' })
    expect(screen.getByText('2.5B')).toBeInTheDocument()
    expect(screen.queryByText('360°')).toBeNull()
  })

  it('geri düğmesi onBack çağırır', () => {
    const { onBack } = renderOverlay()
    fireEvent.click(screen.getByRole('button', { name: 'Haritaya dön' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('Yıl ✎ ve Yer ✎ ayrı geri çağrılar ya da onBack', () => {
    const onEditYear = vi.fn()
    const onEditPlace = vi.fn()
    const { onBack, unmount } = renderOverlay({ onEditYear, onEditPlace })
    fireEvent.click(screen.getByRole('button', { name: 'Yılı değiştir: 1453' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yeri değiştir: Beyoğlu' }))
    expect(onEditYear).toHaveBeenCalledTimes(1)
    expect(onEditPlace).toHaveBeenCalledTimes(1)
    expect(onBack).not.toHaveBeenCalled()
    unmount()

    const second = renderOverlay()
    fireEvent.click(screen.getByRole('button', { name: 'Yılı değiştir: 1453' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yeri değiştir: Beyoğlu' }))
    expect(second.onBack).toHaveBeenCalledTimes(2)
  })

  it('tam ekran düğmesi yalnızca destekleniyorsa', () => {
    const el = document.documentElement as unknown as { requestFullscreen?: unknown }
    const original = el.requestFullscreen
    try {
      el.requestFullscreen = undefined
      const { unmount } = renderOverlay()
      expect(screen.queryByRole('button', { name: 'Tam ekran' })).toBeNull()
      unmount()

      const request = vi.fn().mockResolvedValue(undefined)
      el.requestFullscreen = request
      renderOverlay()
      fireEvent.click(screen.getByRole('button', { name: 'Tam ekran' }))
      expect(request).toHaveBeenCalledTimes(1)
    } finally {
      el.requestFullscreen = original
    }
  })
})

describe('jest ipucu', () => {
  it('ilk açılışta görünür, 3 sn sonra kaybolur', () => {
    renderOverlay()
    expect(screen.getByTestId('gesture-hint')).toHaveTextContent('Sürükle: etrafına bak')
    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(screen.getByTestId('gesture-hint')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByTestId('gesture-hint')).toBeNull()
  })

  it('ilk etkileşimde (sürükleme başlangıcı) hemen kaybolur', () => {
    renderOverlay()
    fireEvent.pointerDown(document.body, { pointerId: 1, clientX: 10, clientY: 10 })
    expect(screen.queryByTestId('gesture-hint')).toBeNull()
  })

  it('tekerlek ya da tuş da ipucunu kapatır', () => {
    const { unmount } = renderOverlay()
    fireEvent.wheel(window, { deltaY: 10 })
    expect(screen.queryByTestId('gesture-hint')).toBeNull()
    unmount()
    renderOverlay()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.queryByTestId('gesture-hint')).toBeNull()
  })
})

describe('katman gizleme ve soluklaşma', () => {
  it('boş alana dokununca katmanlar gizlenir, tekrar dokununca görünür', () => {
    const { root } = renderOverlay()
    const top = root.querySelector('.scene-overlay__top') as HTMLElement
    tapScene()
    expect(root).toHaveClass('is-hidden')
    expect(top).toHaveAttribute('aria-hidden', 'true')
    expect(top).toHaveAttribute('inert')
    tapScene()
    expect(root).not.toHaveClass('is-hidden')
    expect(top).not.toHaveAttribute('inert')
  })

  it('gizliyken de tek satır atıf görünür kalır', () => {
    renderOverlay()
    tapScene()
    const line = screen.getByText('Görsel: Ad Soyad · CC BY-SA 4.0 · Mapillary')
    expect(line.closest('[aria-hidden="true"]')).toBeNull()
    expect(line.closest('[inert]')).toBeNull()
  })

  it('sürükleme dokunuş sayılmaz', () => {
    const { root } = renderOverlay()
    fireEvent.pointerDown(document.body, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(document.body, { pointerId: 1, clientX: 160, clientY: 100 })
    fireEvent.pointerUp(document.body, { pointerId: 1, clientX: 160, clientY: 100 })
    expect(root).not.toHaveClass('is-hidden')
  })

  it('uzun basış ve iki parmak dokunuş sayılmaz', () => {
    const { root } = renderOverlay()
    fireEvent.pointerDown(document.body, { pointerId: 1, clientX: 100, clientY: 100 })
    act(() => {
      vi.advanceTimersByTime(800)
    })
    fireEvent.pointerUp(document.body, { pointerId: 1, clientX: 100, clientY: 100 })
    expect(root).not.toHaveClass('is-hidden')

    fireEvent.pointerDown(document.body, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerDown(document.body, { pointerId: 2, clientX: 200, clientY: 100 })
    fireEvent.pointerUp(document.body, { pointerId: 2, clientX: 200, clientY: 100 })
    fireEvent.pointerUp(document.body, { pointerId: 1, clientX: 100, clientY: 100 })
    expect(root).not.toHaveClass('is-hidden')
  })

  it('katman düğmelerine dokunmak katmanları gizlemez', () => {
    const { root } = renderOverlay()
    const back = screen.getByRole('button', { name: 'Haritaya dön' })
    fireEvent.pointerDown(back, { pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(back, { pointerId: 1, clientX: 20, clientY: 20 })
    expect(root).not.toHaveClass('is-hidden')
  })

  it('Tab tuşu gizli katmanları geri getirir', () => {
    const { root } = renderOverlay()
    tapScene()
    expect(root).toHaveClass('is-hidden')
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(root).not.toHaveClass('is-hidden')
  })

  it('4 sn hareketsizlikte soluklaşır, hareketle geri gelir', () => {
    const { root } = renderOverlay()
    act(() => {
      vi.advanceTimersByTime(3999)
    })
    expect(root).not.toHaveClass('is-idle')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(root).toHaveClass('is-idle')
    fireEvent.pointerMove(document.body, { pointerId: 1, clientX: 5, clientY: 5 })
    expect(root).not.toHaveClass('is-idle')
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(root).toHaveClass('is-idle')
  })

  it('reduced motion: geçişsiz mod işaretlenir, soluklaşma yine olur', () => {
    mockReducedMotion(true)
    const { root } = renderOverlay()
    expect(root).toHaveAttribute('data-motion', 'reduced')
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(root).toHaveClass('is-idle')
  })

  it('reduced motion kapalıysa tam hareket', () => {
    mockReducedMotion(false)
    const { root } = renderOverlay()
    expect(root).toHaveAttribute('data-motion', 'full')
  })
})

describe('paylaş', () => {
  it('navigator.share varsa onu kullanır', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } })
    const { onShare } = renderOverlay()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Paylaş' }))
    })
    expect(onShare).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.test/yil/1453/yer/34-beyoglu/sahne' }))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('kullanıcı paylaşımdan vazgeçerse sessiz kalır', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('iptal'), { name: 'AbortError' }))
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } })
    renderOverlay()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Paylaş' }))
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('navigator.share yoksa "Bağlantıyı kopyala" panoya yazar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    const { onShare } = renderOverlay()
    expect(screen.queryByRole('button', { name: 'Paylaş' })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı kopyala' }))
    })
    expect(onShare).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('https://example.test/yil/1453/yer/34-beyoglu/sahne')
    expect(screen.getByRole('status')).toHaveTextContent('Bağlantı kopyalandı')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByText('Bağlantı kopyalandı')).toBeNull()
  })

  it('kopyalama başarısızsa seçilebilir metin gösterir', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('izin yok'))
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    renderOverlay()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı kopyala' }))
    })
    const input = screen.getByLabelText('Bağlantıyı kopyala') as HTMLInputElement
    expect(input.value).toBe('https://example.test/yil/1453/yer/34-beyoglu/sahne')
    expect(input.readOnly).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }))
    expect(screen.queryByLabelText('Bağlantıyı kopyala')).toBeNull()
  })

  it('pano API’si hiç yoksa da seçilebilir metin; bağlantı yoksa sayfa adresi', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: undefined })
    renderOverlay({ shareUrl: undefined })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı kopyala' }))
    })
    expect((screen.getByLabelText('Bağlantıyı kopyala') as HTMLInputElement).value).toBe(window.location.href)
  })

  it('Web Share başka bir hatayla düşerse panoya kopyalar', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('yasak'), { name: 'NotAllowedError' }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } })
    renderOverlay()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Paylaş' }))
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Bağlantı kopyalandı')
  })
})

describe('atıf', () => {
  it('tek satır her zaman görünür; "Atıf ▾" tam atfı açar', () => {
    renderOverlay()
    expect(screen.getByText('Görsel: Ad Soyad · CC BY-SA 4.0 · Mapillary')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Atıf ▾' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'OpenStreetMap katkıcıları' })).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Atıf ▴' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/')
    expect(screen.getByRole('link', { name: 'OpenStreetMap katkıcıları' })).toBeInTheDocument()
  })

  it('atıf yoksa harita verisi satırı', () => {
    renderOverlay({ attribution: null })
    expect(screen.getByText('Harita verisi © OpenStreetMap katkıcıları')).toBeInTheDocument()
  })
})
