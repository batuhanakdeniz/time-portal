import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

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

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function pickRome() {
  fireEvent.click(await screen.findByRole('button', { name: 'Roma seç' }))
}
const status = () => screen.queryByRole('status') ?? screen.getByRole('alert')
const generate = () => screen.getByRole('button', { name: 'Sahne oluştur' })
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('App', () => {
  it('başlık, özet ve pasif düğmeyi gösterir; konum yokken düğme pasiftir', async () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Time Portal' })).toBeInTheDocument()
    expect(generate()).toBeDisabled()
    await pickRome()
    expect(generate()).toBeEnabled()
    expect(screen.getByText('2026 · 41.9000° K, 12.5000° D')).toBeInTheDocument()
  })

  it('PENDING→RUNNING→READY durumlarını gösterir ve panoramayı önizler', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(scene('PENDING'), 202))
      .mockResolvedValueOnce(json(scene('PENDING')))
      .mockResolvedValueOnce(json(scene('RUNNING')))
      .mockResolvedValueOnce(json(readyScene))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    expect(status()).toHaveTextContent('Gönderiliyor…')
    expect(generate()).toBeDisabled()
    await tick(0)
    expect(status()).toHaveTextContent('Sırada…')
    await tick(1000)
    expect(status()).toHaveTextContent('Üretiliyor…')
    expect(generate()).toBeDisabled()
    await tick(1000)
    expect(status()).toHaveTextContent('Sahne hazır')
    expect(generate()).toBeEnabled()

    const img = screen.getByRole('img', { name: 'Üretilen panorama: 2026, 41.9000° K, 12.5000° D' })
    expect(img).toHaveAttribute('src', '/api/samples/sample-pano.png')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ year: 2026, latitude: 41.9, longitude: 12.5 })
  })

  it('seçim sonradan değişse de önizleme kendi isteğinin açıklamasını korur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(readyScene)))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(status()).toHaveTextContent('Sahne hazır')
    fireEvent.click(screen.getByRole('button', { name: 'Sidney seç' }))
    expect(screen.getByRole('img', { name: 'Üretilen panorama: 2026, 41.9000° K, 12.5000° D' })).toBeInTheDocument()
    expect(screen.getByText('2026 · 33.8688° G, 151.2093° D')).toBeInTheDocument()
  })

  it('FAILED durumunu mesajıyla gösterir, resim göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(scene('FAILED', { error: 'üretici çöktü' }))),
    )
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(status()).toHaveTextContent('Sahne üretilemedi. Biraz sonra tekrar dene.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(generate()).toBeEnabled()
  })

  it('diğer 400 hatalarında genel Türkçe mesaj gösterir, sunucu metnini göstermez', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: 'latitude aralık dışı' }, 400)))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(status()).toHaveTextContent('İstek geçersiz.')
    expect(generate()).toBeEnabled()
  })

  it('ağ hatasında "Sunucuya ulaşılamadı" gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(status()).toHaveTextContent('Sunucuya ulaşılamadı')
  })

  it('READY ama sonuç yoksa geçersiz sonuç mesajı gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(scene('READY'))))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(status()).toHaveTextContent('Sunucu geçersiz sonuç döndü')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('bilinmeyen status gelirse boş kalmaz, geçersiz yanıt der', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(scene('???'))))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(status()).toHaveTextContent('Sunucudan geçersiz yanıt')
  })

  it('2xx ama JSON olmayan yanıt "ulaşılamadı" değil geçersiz yanıt der', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('<html/>', { status: 200 })))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(status()).toHaveTextContent('Sunucudan geçersiz yanıt')
  })

  it('beklenmeyen hata genel mesaj verir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('garip')))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(status()).toHaveTextContent('Beklenmeyen bir hata oluştu')
  })

  it('yoklama sırasında ağ hatası da "Sunucuya ulaşılamadı" gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockRejectedValue(new TypeError('x')))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(status()).toHaveTextContent('Sunucuya ulaşılamadı')
  })

  it('üretim sürerken düğme pasiftir, ikinci tıklama yeni istek başlatmaz ve yoklama sürer', async () => {
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      if (init?.method === 'POST') return json(scene('PENDING'), 202)
      return json(url.endsWith('/s1') ? scene('RUNNING') : readyScene)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(signals.every((s) => !s.aborted)).toBe(true)
    expect(generate()).toBeDisabled()
    fireEvent.click(generate())
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1)
    expect(signals.every((s) => !s.aborted)).toBe(true)
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
    const { unmount } = render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((s) => !s.aborted)).toBe(true)
    unmount()
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  describe('sonuç arayüzü (#42)', () => {
    const run = async (final: unknown) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(final)))
      render(<App />)
      await pickRome()
      fireEvent.click(generate())
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
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(withResult({}))))
      render(<App />)
      await pickRome()
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Zaman çizgisi' }), { key: 'Home' })
      fireEvent.click(generate())
      await tick(0)
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
      render(<App />)
      expect(screen.getByRole('status')).toBeInTheDocument()
      await pickRome()
      fireEvent.click(generate())
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
      render(<App />)
      await pickRome()
      fireEvent.click(generate())
      await tick(0)
      expect(status()).toHaveTextContent(text)
      expect(screen.queryByText(/not found|upstream/)).not.toBeInTheDocument()
    })

    it('POST 400 Türkiye dışı → Türkçe mesaj, İngilizce metin yok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: 'location outside supported area' }, 400)))
      render(<App />)
      await pickRome()
      fireEvent.click(generate())
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
      render(<App />)
      await pickRome()
      fireEvent.click(generate())
      await tick(0)
      await tick(1000)
      expect(status()).toHaveTextContent('Üretiliyor… İlk sahne 30 saniyeyi bulabilir.')
    })
  })
})
