import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate, type InitialEntry } from 'react-router'
import App, { AppRoutes } from './App'

vi.mock('./location/LocationPicker', () => ({
  LocationPicker: ({ onChange }: { onChange: (v: { latitude: number; longitude: number }) => void }) => (
    <div>
      <button onClick={() => onChange({ latitude: 41.9, longitude: 12.5 })}>Roma seç</button>
      <button onClick={() => onChange({ latitude: -33.8688, longitude: 151.2093 })}>Sidney seç</button>
    </div>
  ),
}))

// three/WebGL jsdom'da yok; görüntüleyicinin kendisi ViewerSection testlerinde sınanır.
vi.mock('./scene/ViewerSection', () => ({
  ViewerSection: ({ src, alt, kind, depthUrl }: { src: string; alt: string; kind?: string; depthUrl?: string }) => (
    <figure data-testid="viewer" data-kind={kind ?? ''} data-depth={depthUrl ?? ''}>
      <img src={src} alt={alt} />
    </figure>
  ),
}))

const scene = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 's1',
  status,
  request: { year: 2026, latitude: 41.9, longitude: 12.5 },
  result: null,
  error: null,
  createdAt: '2026-10-15T15:30:00Z',
  ...extra,
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const readyScene = scene('READY', { result: { panoramaUrl: '/api/samples/sample-pano.png', depthUrl: '/api/samples/sample-depth.png' } })

/** Testte adres çubuğu ve tarayıcının geri tuşu yerine geçer. */
function Probe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <span data-testid="url">{location.pathname}</span>
      <button type="button" onClick={() => navigate(-1)}>
        tarayıcı geri
      </button>
    </>
  )
}

function renderAt(...entries: InitialEntry[]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <AppRoutes />
      <Probe />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

const url = () => screen.getByTestId('url').textContent
const browserBack = () => fireEvent.click(screen.getByRole('button', { name: 'tarayıcı geri' }))
async function pickRome() {
  fireEvent.click(await screen.findByRole('button', { name: 'Roma seç' }))
}
const goToYear = () => screen.getByRole('button', { name: 'Bu yıla git' })
const seeScene = () => screen.getByRole('button', { name: 'Sahneyi gör' })
const backToMap = () => screen.getByRole('button', { name: 'Haritaya dön' })
const retry = () => screen.getByRole('button', { name: 'Tekrar dene' })
const status = () => screen.queryByRole('status') ?? screen.getByRole('alert')
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

/** Haritaya doğrudan gelir, Roma'yı seçer ve sahne sayfasına geçer. */
async function openScene(mapUrl = '/yil/2026') {
  renderAt(mapUrl)
  await pickRome()
  fireEvent.click(seeScene())
}

describe('App: yönlendirme', () => {
  it('BrowserRouter ile adres çubuğundaki rotayı açar', () => {
    vi.stubGlobal('fetch', vi.fn())
    window.history.pushState({}, '', '/yil/1453')
    render(<App />)
    expect(screen.getByRole('link', { name: 'Yılı değiştir: 1453' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('yıl sayfası: başlık, zaman çizgisi, yıl hapı; varsayılan yıl 2026', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Time Portal' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Zaman çizgisi' })).toBeInTheDocument()
    expect(screen.getByTestId('yil-hapi')).toHaveTextContent('2026')
  })

  it('"Bu yıla git" haritaya push eder ve yılı tp.year olarak saklar', () => {
    renderAt('/')
    fireEvent.click(goToYear())
    expect(url()).toBe('/yil/2026')
    expect(localStorage.getItem('tp.year')).toBe('2026')
    browserBack()
    expect(url()).toBe('/')
  })

  it('zaman çizgisinde seçilen MÖ yıl mo- slug ile açılır', () => {
    renderAt('/')
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Zaman çizgisi' }), { key: 'Home' })
    expect(screen.getByTestId('yil-hapi')).toHaveTextContent('MÖ 100.000')
    fireEvent.click(goToYear())
    expect(url()).toBe('/yil/mo-100000')
  })

  it('yıl sayfası son yılı tp.year kaydından okur', () => {
    localStorage.setItem('tp.year', '-1200')
    renderAt('/')
    expect(screen.getByTestId('yil-hapi')).toHaveTextContent('MÖ 1200')
    fireEvent.click(goToYear())
    expect(url()).toBe('/yil/mo-1200')
  })

  it('localStorage erişilemezse yıl sayfası 2026 ile açılır', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    renderAt('/')
    expect(screen.getByTestId('yil-hapi')).toHaveTextContent('2026')
    fireEvent.click(goToYear())
    expect(url()).toBe('/yil/2026')
  })

  it('/yil/-1200 → /yil/mo-1200 (replace)', () => {
    renderAt('/', '/yil/-1200')
    expect(url()).toBe('/yil/mo-1200')
    expect(screen.getByRole('link', { name: 'Yılı değiştir: MÖ 1200' })).toBeInTheDocument()
    browserBack()
    expect(url()).toBe('/')
  })

  it.each(['/yil/0', '/yil/mo-0', '/yil/abc', '/yil/100001', '/yil/0/yer/34', '/yil/0/yer/34/sahne'])(
    '%s → / ve mesaj',
    (path) => {
      renderAt(path)
      expect(url()).toBe('/')
      expect(screen.getByRole('alert')).toHaveTextContent('Bu yıl açılamadı. Yıl 0 yoktur; MÖ 100.000 ile 100.000 arasında bir yıl seç.')
    },
  )

  it('geçersiz yıl mesajı tek seferliktir: geri/ileri ile dönünce yeniden çıkmaz', () => {
    renderAt('/yil/0')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(goToYear())
    expect(url()).toBe('/yil/2026')
    browserBack()
    expect(url()).toBe('/')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('geçersiz yer mesajı tek seferliktir', () => {
    renderAt('/yil/1453/yer/beyoglu')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Yılı değiştir: 1453' }))
    expect(url()).toBe('/')
    browserBack()
    expect(url()).toBe('/yil/1453')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['/bilinmeyen', '/yil', '/yil/1453/yer', '/yil/1453/yer/34/sahne/fazla'])('bilinmeyen yol %s → /', (path) => {
    renderAt(path)
    expect(url()).toBe('/')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('harita derin bağlantısı yılı tp.year olarak saklar', () => {
    renderAt('/yil/mo-44')
    expect(localStorage.getItem('tp.year')).toBe('-44')
  })

  it('geçersiz yer slug\'ı yılın haritasına yönlendirir ve mesaj gösterir', () => {
    renderAt('/yil/1453/yer/beyoglu')
    expect(url()).toBe('/yil/1453')
    expect(screen.getByRole('alert')).toHaveTextContent('Bu yer bağlantısı geçersiz. Haritadan bir yer seç.')
  })

  it('geçersiz yer slug\'ıyla sahne de haritaya yönlendirir', () => {
    renderAt('/yil/1453/yer/34--x/sahne')
    expect(url()).toBe('/yil/1453')
  })

  it('geçerli yer slug\'ı (34-beyoglu) harita sayfasında kalır', () => {
    renderAt('/yil/1453/yer/34-beyoglu')
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
  })

  it('harita: yıl rozeti yıl sayfasına bağlanır', () => {
    renderAt('/yil/1453')
    const badge = screen.getByRole('link', { name: 'Yılı değiştir: 1453' })
    expect(badge).toHaveTextContent('1453')
    fireEvent.click(badge)
    expect(url()).toBe('/')
  })

  it('harita: konum yokken "Sahneyi gör" pasif, seçince aktif; özet koordinatı gösterir', async () => {
    renderAt('/yil/2026')
    expect(seeScene()).toBeDisabled()
    expect(screen.getByText('2026 · Haritadan konum seç')).toBeInTheDocument()
    await pickRome()
    expect(seeScene()).toBeEnabled()
    expect(screen.getByText('2026 · 41.9000° K, 12.5000° D')).toBeInTheDocument()
  })

  it('harita içindeki seçim replace eder: geri tuşu yıl sayfasına döner', async () => {
    renderAt('/')
    fireEvent.click(goToYear())
    await pickRome()
    fireEvent.click(screen.getByRole('button', { name: 'Sidney seç' }))
    expect(url()).toBe('/yil/2026/yer/00')
    browserBack()
    expect(url()).toBe('/')
  })

  it('"Sahneyi gör" sahne sayfasına push eder; geri tuşu seçimi koruyarak haritaya döner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    await openScene('/yil/1453')
    expect(url()).toBe('/yil/1453/yer/00/sahne')
    browserBack()
    expect(url()).toBe('/yil/1453/yer/00')
    expect(await screen.findByText('1453 · 41.9000° K, 12.5000° D')).toBeInTheDocument()
    expect(seeScene()).toBeEnabled()
  })

  it('sahne: "←" uygulama içinden gelindiyse geri gider (haritaya, seçim korunur)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderAt('/')
    fireEvent.click(goToYear())
    await pickRome()
    fireEvent.click(seeScene())
    fireEvent.click(backToMap())
    expect(url()).toBe('/yil/2026/yer/00')
    expect(await screen.findByText('2026 · 41.9000° K, 12.5000° D')).toBeInTheDocument()
    browserBack()
    expect(url()).toBe('/')
  })

  it('sahne: derin bağlantıda "←" üst rotaya replace eder, siteden çıkmaz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderAt({ pathname: '/yil/1453/yer/34/sahne', state: { selection: { latitude: 41.0082, longitude: 28.9784 } } })
    fireEvent.click(backToMap())
    expect(url()).toBe('/yil/1453/yer/34')
    expect(await screen.findByText('1453 · 41.0082° K, 28.9784° D')).toBeInTheDocument()
    // replace edildiyse geride sahne kalmamıştır
    browserBack()
    expect(url()).toBe('/yil/1453/yer/34')
  })

  it('sahne: kanonik olmayan yıl yönlendirilir, derin bağlantı bilgisi ve seçim korunur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderAt({ pathname: '/yil/-1453/yer/34/sahne', state: { selection: { latitude: 41.0082, longitude: 28.9784 } } })
    expect(url()).toBe('/yil/mo-1453/yer/34/sahne')
    fireEvent.click(backToMap())
    expect(url()).toBe('/yil/mo-1453/yer/34')
  })

  it('sahne: yer bilgisi olmayan derin bağlantı istek atmaz, haritaya yönlendiren mesaj gösterir', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/yil/1453/yer/34-beyoglu/sahne')
    expect(screen.getByText('Bu bağlantıdaki yer henüz açılamıyor. Haritadan bir yer seç.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(backToMap())
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
  })

  it('sahne sayfasında da yıl rozeti gösterilir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    await openScene('/yil/mo-44')
    expect(screen.getByRole('link', { name: 'Yılı değiştir: MÖ 44' })).toBeInTheDocument()
  })
})

describe('App: sahne üretimi', () => {
  it('PENDING→RUNNING→READY durumlarını gösterir ve panoramayı önizler', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(scene('PENDING'), 202))
      .mockResolvedValueOnce(json(scene('PENDING')))
      .mockResolvedValueOnce(json(scene('RUNNING')))
      .mockResolvedValueOnce(json(readyScene))
    vi.stubGlobal('fetch', fetchMock)
    await openScene()
    expect(status()).toHaveTextContent('Gönderiliyor…')
    await tick(0)
    expect(status()).toHaveTextContent('Sırada…')
    await tick(1000)
    expect(status()).toHaveTextContent('Üretiliyor…')
    await tick(1000)
    expect(status()).toHaveTextContent('Sahne hazır')

    const img = screen.getByRole('img', { name: 'Üretilen panorama: 2026, 41.9000° K, 12.5000° D' })
    expect(img).toHaveAttribute('src', '/api/samples/sample-pano.png')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ year: 2026, latitude: 41.9, longitude: 12.5 })
  })

  it('istekte URL\'deki yıl kullanılır (MÖ 1200)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(readyScene))
    vi.stubGlobal('fetch', fetchMock)
    await openScene('/yil/mo-1200')
    await tick(0)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ year: -1200, latitude: 41.9, longitude: 12.5 })
  })

  it('haritaya dönüp başka yer seçince yeni sahne yeni konumla istenir', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json(scene('PENDING'), 202) : json(readyScene),
    )
    vi.stubGlobal('fetch', fetchMock)
    await openScene()
    await tick(0)
    expect(screen.getByRole('img', { name: 'Üretilen panorama: 2026, 41.9000° K, 12.5000° D' })).toBeInTheDocument()
    fireEvent.click(backToMap())
    fireEvent.click(await screen.findByRole('button', { name: 'Sidney seç' }))
    fireEvent.click(seeScene())
    await tick(0)
    expect(screen.getByRole('img', { name: 'Üretilen panorama: 2026, 33.8688° G, 151.2093° D' })).toBeInTheDocument()
    const posts = fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')
    expect(JSON.parse(posts[1][1].body)).toEqual({ year: 2026, latitude: -33.8688, longitude: 151.2093 })
  })

  it('FAILED durumunu mesajıyla gösterir, resim göstermez; "Tekrar dene" çıkar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(scene('FAILED', { error: 'üretici çöktü' }))),
    )
    await openScene()
    await tick(0)
    expect(status()).toHaveTextContent('Sahne üretilemedi. Biraz sonra tekrar dene.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(retry()).toBeEnabled()
  })

  it('"Tekrar dene" üretimi yeniden başlatır', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(scene('PENDING'), 202))
      .mockResolvedValueOnce(json(readyScene))
    vi.stubGlobal('fetch', fetchMock)
    await openScene()
    await tick(0)
    expect(status()).toHaveTextContent('Sunucuya ulaşılamadı')
    fireEvent.click(retry())
    await tick(0)
    expect(status()).toHaveTextContent('Sahne hazır')
    expect(screen.queryByRole('button', { name: 'Tekrar dene' })).not.toBeInTheDocument()
  })

  it('diğer 400 hatalarında genel Türkçe mesaj gösterir, sunucu metnini göstermez', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: 'latitude aralık dışı' }, 400)))
    await openScene()
    await tick(0)
    expect(status()).toHaveTextContent('İstek geçersiz.')
    expect(retry()).toBeEnabled()
  })

  it('ağ hatasında "Sunucuya ulaşılamadı" gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await openScene()
    await tick(0)
    expect(status()).toHaveTextContent('Sunucuya ulaşılamadı')
  })

  it('READY ama sonuç yoksa geçersiz sonuç mesajı gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(scene('READY'))))
    await openScene()
    await tick(0)
    expect(status()).toHaveTextContent('Sunucu geçersiz sonuç döndü')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('bilinmeyen status gelirse boş kalmaz, geçersiz yanıt der', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(scene('???'))))
    await openScene()
    await tick(0)
    expect(status()).toHaveTextContent('Sunucudan geçersiz yanıt')
  })

  it('2xx ama JSON olmayan yanıt "ulaşılamadı" değil geçersiz yanıt der', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('<html/>', { status: 200 })))
    await openScene()
    await tick(0)
    expect(status()).toHaveTextContent('Sunucudan geçersiz yanıt')
  })

  it('beklenmeyen hata genel mesaj verir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('garip')))
    await openScene()
    await tick(0)
    expect(status()).toHaveTextContent('Beklenmeyen bir hata oluştu')
  })

  it('yoklama sırasında ağ hatası da "Sunucuya ulaşılamadı" gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockRejectedValue(new TypeError('x')))
    await openScene()
    await tick(0)
    expect(status()).toHaveTextContent('Sunucuya ulaşılamadı')
  })

  it('sahne sayfası tek istek atar ve yoklama sürer', async () => {
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      if (init?.method === 'POST') return json(scene('PENDING'), 202)
      return json(url.endsWith('/s1') ? scene('RUNNING') : readyScene)
    })
    vi.stubGlobal('fetch', fetchMock)
    await openScene()
    await tick(0)
    await tick(1000)
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2)
    expect(signals.every((s) => !s.aborted)).toBe(true)
  })

  it('StrictMode altında sahne sayfası tek POST atar', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json(scene('PENDING'), 202) : json(readyScene),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/yil/2026']}>
          <AppRoutes />
        </MemoryRouter>
      </StrictMode>,
    )
    await pickRome()
    fireEvent.click(seeScene())
    await tick(0)
    expect(status()).toHaveTextContent('Sahne hazır')
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1)
  })

  it('yükleme sırasında haritaya dönmek yoklamayı iptal eder', async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.signal && init.method !== 'POST') signals.push(init.signal)
        return init?.method === 'POST' ? json(scene('PENDING'), 202) : json(scene('RUNNING'))
      }),
    )
    await openScene()
    await tick(0)
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((s) => !s.aborted)).toBe(true)
    browserBack()
    expect(url()).toBe('/yil/2026/yer/00')
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  it('unmount olunca yoklamayı iptal eder', async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.signal && init.method !== 'POST') signals.push(init.signal)
        return init?.method === 'POST' ? json(scene('PENDING'), 202) : json(scene('RUNNING'))
      }),
    )
    renderAt('/yil/2026')
    await pickRome()
    fireEvent.click(seeScene())
    await tick(0)
    expect(signals.length).toBeGreaterThan(0)
    cleanup()
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  describe('sonuç arayüzü (#42)', () => {
    const run = async (final: unknown, mapUrl = '/yil/2026') => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(final)))
      await openScene(mapUrl)
      await tick(0)
    }
    const withResult = (result: Record<string, unknown>) =>
      scene('READY', { result: { panoramaUrl: '/p.jpg', depthUrl: '/d.png', ...result } })

    it('"Beyoğlu, İstanbul" başlığı ve 2026 notu; alt yeri içerir', async () => {
      await run(withResult({ place: { province: 'İstanbul', district: 'Beyoğlu' } }))
      expect(screen.getByRole('heading', { name: 'Beyoğlu, İstanbul' })).toBeInTheDocument()
      expect(screen.getByText('2026 görünümü')).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'Üretilen panorama: 2026, Beyoğlu, İstanbul' })).toBeInTheDocument()
    })

    it('Merkez ilçesi "<İl> Merkez" yazılır', async () => {
      await run(withResult({ place: { province: 'Hakkari', district: 'Merkez' } }))
      expect(screen.getByRole('heading', { name: 'Hakkari Merkez' })).toBeInTheDocument()
    })

    it('place yoksa başlıkta koordinat gösterilir', async () => {
      await run(withResult({ place: null }))
      expect(screen.getByRole('heading', { name: '41.9000° K, 12.5000° D' })).toBeInTheDocument()
    })

    it('2026 dışı yılda (MÖ 100.000) yıl notu çıkar', async () => {
      await run(withResult({}), '/yil/mo-100000')
      expect(screen.getByText(/^Şimdilik 2026 görünümü gösteriliyor\. Seçtiğin yıl \(MÖ 100\.000\) sonraki aşamada gelecek\.$/)).toBeInTheDocument()
      expect(screen.queryByText('2026 görünümü')).not.toBeInTheDocument()
    })

    it('atıf satırı ve ODbL satırı görüntüleyicinin altında', async () => {
      await run(withResult({ attribution: { author: 'ayse', license: 'CC BY-SA 4.0', licenseUrl: null, sourceUrl: null, provider: 'mapillary' } }))
      expect(screen.getByText(/^Görsel:/)).toHaveTextContent('Görsel: ayse · CC BY-SA 4.0 · Mapillary')
      expect(screen.getByText(/İlçe sınırları/)).toHaveTextContent('İlçe sınırları © OpenStreetMap katkıcıları (ODbL)')
    })

    it('kind photo → ViewerSection kind="photo" ve depthUrl alır', async () => {
      await run(withResult({ kind: 'photo' }))
      expect(screen.getByRole('img', { name: /^Üretilen fotoğraf:/ })).toBeInTheDocument()
      const viewer = screen.getByTestId('viewer')
      expect(viewer).toHaveAttribute('data-kind', 'photo')
      expect(viewer).toHaveAttribute('data-depth', '/d.png')
    })

    it('kind yoksa görüntüleyiciye photo geçilmez (panorama)', async () => {
      await run(withResult({}))
      expect(screen.getByTestId('viewer')).toHaveAttribute('data-kind', 'panorama')
    })

    it('hata durumunda mesaj role="alert", diğer durumlarda status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: 'x' }, 500)))
      await openScene()
      expect(screen.getByRole('status')).toBeInTheDocument()
      await tick(0)
      expect(screen.getByRole('alert')).toHaveTextContent('Sahne üretilemedi. Biraz sonra tekrar dene.')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it.each([
      [404, 'Sahne artık bulunamıyor. Tekrar oluştur.'],
      [503, 'Şu anda çok fazla sahne üretiliyor. Birazdan tekrar dene.'],
      [500, 'Sahne üretilemedi. Biraz sonra tekrar dene.'],
    ])('yoklamada HTTP %i → Türkçe mesaj, sunucu metni yok', async (code, text) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json({ error: 'scene not found upstream' }, code)),
      )
      await openScene()
      await tick(0)
      expect(status()).toHaveTextContent(text)
      expect(screen.queryByText(/not found|upstream/)).not.toBeInTheDocument()
    })

    it('POST 400 Türkiye dışı → Türkçe mesaj, İngilizce metin yok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: 'location outside supported area' }, 400)))
      await openScene()
      await tick(0)
      expect(status()).toHaveTextContent("Şimdilik yalnızca Türkiye'deki konumlar destekleniyor.")
      expect(screen.queryByText(/outside supported area/)).not.toBeInTheDocument()
    })

    it('FAILED no image found → görsel bulunamadı mesajı', async () => {
      await run(scene('FAILED', { error: 'no image found for location' }))
      expect(status()).toHaveTextContent('Bu konum için açık lisanslı bir görsel bulunamadı. Yakındaki başka bir noktayı dene.')
      expect(screen.queryByText(/no image found/)).not.toBeInTheDocument()
    })

    it('FAILED bilinmeyen metin → genel mesaj, ham metin gösterilmez', async () => {
      await run(scene('FAILED', { error: 'boom internal' }))
      expect(status()).toHaveTextContent('Sahne üretilemedi. Biraz sonra tekrar dene.')
      expect(screen.queryByText(/boom internal/)).not.toBeInTheDocument()
    })

    it('RUNNING iken 30 saniye ipucu gösterilir', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === 'POST' ? json(scene('PENDING'), 202) : json(scene('RUNNING')))),
      )
      await openScene()
      await tick(0)
      await tick(1000)
      expect(status()).toHaveTextContent('Üretiliyor… İlk sahne 30 saniyeyi bulabilir.')
    })
  })
})
