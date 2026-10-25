import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate, type InitialEntry } from 'react-router'
import App, { AppRoutes } from './App'
import { DISTRICTS_URL, PROVINCES_URL, resetPlacesCache } from './location/places'

// --- MapLibre (WebGL jsdom'da yok): olay işleyicileri yakalanır, testler il/ilçe tıklamasını tetikler ---
type Handler = (e?: { features?: { id?: string | number }[] }) => void
const maps = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>,
  created: 0,
  setFeatureState: vi.fn(),
}))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({ default: '/assets/worker.mjs' }))
vi.mock('maplibre-gl', () => {
  class Map {
    touchZoomRotate = { disableRotation() {} }
    keyboard = { disableRotation() {} }
    canvas = { style: { cursor: '' } }
    constructor() {
      maps.created++
      for (const k of Object.keys(maps.handlers)) delete maps.handlers[k]
    }
    on(type: string, layerOrFn: string | Handler, fn?: Handler) {
      if (typeof layerOrFn === 'string') maps.handlers[`${type}:${layerOrFn}`] = fn!
      else maps.handlers[type] = layerOrFn
    }
    getCanvas() {
      return this.canvas
    }
    setFeatureState(ref: unknown, state: unknown) {
      maps.setFeatureState(ref, state)
    }
    cameraForBounds() {
      return { center: [29, 41], zoom: 8 }
    }
    easeTo() {}
    remove() {
      for (const k of Object.keys(maps.handlers)) delete maps.handlers[k]
    }
  }
  return { Map, setWorkerUrl() {} }
})

// three/WebGL jsdom'da yok; görüntüleyicinin kendisi ViewerSection testlerinde sınanır.
vi.mock('./scene/ViewerSection', () => ({
  ViewerSection: (p: { src: string; alt: string; kind?: string; depthUrl?: string; showFullscreenButton?: boolean }) => (
    <figure data-testid="viewer" data-kind={p.kind ?? ''} data-depth={p.depthUrl ?? ''} data-fs={String(p.showFullscreenButton)}>
      <img src={p.src} alt={p.alt} />
    </figure>
  ),
}))

// --- /geo/*.json küçük fikstürü ---
const sq = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
const province = (plate: string, name: string, centerLat: number, centerLon: number) => ({
  type: 'Feature',
  geometry: sq,
  properties: { plate, name, minLng: centerLon - 1, minLat: centerLat - 1, maxLng: centerLon + 1, maxLat: centerLat + 1, centerLat, centerLon },
})
const district = (plate: string, slug: string, name: string, provinceName: string, lat: number, lon: number) => ({
  type: 'Feature',
  geometry: sq,
  properties: { key: `${plate}-${slug}`, plate, slug, name, province: provinceName, lat, lon },
})
const GEO: Record<string, unknown> = {
  [PROVINCES_URL]: {
    type: 'FeatureCollection',
    features: [province('34', 'İstanbul', 41.01, 28.96028), province('06', 'Ankara', 39.92, 32.85)],
  },
  [DISTRICTS_URL]: {
    type: 'FeatureCollection',
    features: [
      district('34', 'beyoglu', 'Beyoğlu', 'İstanbul', 41.03194, 28.97611),
      district('34', 'fatih', 'Fatih', 'İstanbul', 41.0186, 28.9397), // Beyoğlu'na ~3,4 km
      district('34', 'sisli', 'Şişli', 'İstanbul', 41.0602, 28.9877), // ~3,3 km
      district('34', 'kadikoy', 'Kadıköy', 'İstanbul', 40.99, 29.03), // ~6,4 km
      district('06', 'cankaya', 'Çankaya', 'Ankara', 39.9179, 32.8627),
    ],
  },
}
const BEYOGLU_BODY = { year: 1453, latitude: 41.03194, longitude: 28.97611 }

// --- Sahne API'si ---
const scene = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 's1',
  status,
  request: BEYOGLU_BODY,
  result: null,
  error: null,
  createdAt: '2026-10-15T15:30:00Z',
  ...extra,
})
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const OSMANLI = { id: 'osmanli-klasik', name: 'Osmanlı klasik', yearFrom: 1453, yearTo: 1700, confidence: 'yorum' }
const readyScene = (result: Record<string, unknown> = {}) =>
  scene('READY', { result: { panoramaUrl: '/p.jpg', depthUrl: '/d.png', period: OSMANLI, ...result } })

type Api = (url: string, init?: RequestInit) => Response | Promise<Response>
const never: Api = () => new Promise<Response>(() => {})
let geoGate: Promise<void> | null = null

/** /geo/* fikstürden, /api/* verilen işleyiciden. */
function stubFetch(api: Api = never) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url in GEO) {
      if (geoGate) await geoGate
      return json(GEO[url])
    }
    return api(url, init)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
/** Sırayla yanıt veren API; son yanıt tekrarlanır. */
function sequence(...responses: (() => Response | Promise<Response>)[]): Api {
  let i = 0
  return () => responses[Math.min(i++, responses.length - 1)]()
}
const apiCalls = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.filter(([u]) => String(u).startsWith('/api/'))
const posts = (fn: ReturnType<typeof stubFetch>) => apiCalls(fn).filter(([, i]) => i?.method === 'POST')
const postBody = (fn: ReturnType<typeof stubFetch>, n = 0) => JSON.parse(String(posts(fn)[n][1]!.body))

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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  resetPlacesCache()
  geoGate = null
  maps.setFeatureState.mockClear()
  stubFetch()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

const url = () => screen.getByTestId('url').textContent
const browserBack = () => fireEvent.click(screen.getByRole('button', { name: 'tarayıcı geri' }))
const goToYear = () => screen.getByRole('button', { name: /Bu yıla git/ })
const seeScene = () => screen.getByRole('button', { name: 'Sahneyi gör' })
const summary = () => screen.getByTestId('map-summary')
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const loader = () => screen.queryByRole('region', { name: 'Sahne hazırlanıyor' })

/** Harita verisi gelip MapLibre "load" olayı verilene kadar bekler. */
async function mapReady() {
  await waitFor(() => expect(maps.handlers.load).toBeDefined())
  act(() => maps.handlers.load())
}
const clickProvince = (plate: string) => act(() => maps.handlers['click:province-fill']({ features: [{ id: plate }] }))
const clickDistrict = (key: string) => act(() => maps.handlers['click:district-fill']({ features: [{ id: key }] }))

/** Haritayı açar, Beyoğlu'nu seçer ve sahne sayfasına geçer. */
async function openBeyogluScene(mapUrl = '/yil/1453') {
  renderAt(mapUrl)
  await mapReady()
  clickProvince('34')
  clickDistrict('34-beyoglu')
  fireEvent.click(seeScene())
  await tick(0)
}

describe('App: yıl sayfası (höyük kesiti)', () => {
  it('BrowserRouter ile adres çubuğundaki rotayı açar', () => {
    window.history.pushState({}, '', '/yil/1453')
    render(<App />)
    expect(screen.getByRole('link', { name: 'Yılı değiştir: 1453' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('başlık (ekran okuyucu), höyük kesiti; eski zaman çizgisi yok; varsayılan yıl 2026', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Time Portal', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /höyük kesiti/ })).toHaveAttribute('aria-valuenow', '2026')
    expect(screen.queryByRole('slider', { name: 'Zaman çizgisi' })).not.toBeInTheDocument()
  })

  it('"Bu yıla git" haritaya push eder ve yılı tp.year olarak saklar', () => {
    renderAt('/')
    fireEvent.click(goToYear())
    expect(url()).toBe('/yil/2026')
    expect(localStorage.getItem('tp.year')).toBe('2026')
    browserBack()
    expect(url()).toBe('/')
  })

  it('kısayolla seçilen yıl onaylanınca o yılın haritası açılır', async () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: /Fetih/ }))
    await tick(0)
    fireEvent.click(goToYear())
    await tick(0)
    expect(url()).toBe('/yil/1453')
    expect(localStorage.getItem('tp.year')).toBe('1453')
  })

  it('yazılan MÖ yıl iki Enter ile mo- slug ile açılır (onConfirm yeni yılı okur)', async () => {
    renderAt('/')
    const input = screen.getByRole('textbox', { name: 'Yıl yaz' })
    fireEvent.change(input, { target: { value: 'MÖ 1200' } })
    const form = input.closest('form')!
    fireEvent.submit(form)
    await tick(0)
    fireEvent.submit(form)
    await tick(0)
    expect(url()).toBe('/yil/mo-1200')
  })

  it('yıl sayfası son yılı tp.year kaydından okur', () => {
    localStorage.setItem('tp.year', '-1200')
    renderAt('/')
    expect(screen.getByRole('slider', { name: /höyük kesiti/ })).toHaveAttribute('aria-valuenow', '-1200')
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
    fireEvent.click(goToYear())
    expect(url()).toBe('/yil/2026')
  })
})

describe('App: yönlendirme', () => {
  it('/yil/-1200 → /yil/mo-1200 (replace)', () => {
    renderAt('/', '/yil/-1200')
    expect(url()).toBe('/yil/mo-1200')
    expect(screen.getByRole('link', { name: 'Yılı değiştir: MÖ 1200' })).toBeInTheDocument()
    browserBack()
    expect(url()).toBe('/')
  })

  it.each(['/yil/0', '/yil/mo-0', '/yil/abc', '/yil/100001', '/yil/0/yer/34', '/yil/0/yer/34/sahne'])('%s → / ve mesaj', (path) => {
    renderAt(path)
    expect(url()).toBe('/')
    expect(screen.getByRole('alert')).toHaveTextContent('Bu yıl açılamadı. Yıl 0 yoktur; MÖ 100.000 ile 100.000 arasında bir yıl seç.')
  })

  it('geçersiz yıl mesajı tek seferliktir: geri/ileri ile dönünce yeniden çıkmaz', () => {
    renderAt('/yil/0')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(goToYear())
    expect(url()).toBe('/yil/2026')
    browserBack()
    expect(url()).toBe('/')
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

  it.each(['/yil/1453/yer/beyoglu', '/yil/1453/yer/34--x/sahne'])('biçimi bozuk yer %s → yılın haritası ve mesaj', (path) => {
    renderAt(path)
    expect(url()).toBe('/yil/1453')
    expect(screen.getByRole('alert')).toHaveTextContent('Bu yer bağlantısı geçersiz. Haritadan bir yer seç.')
  })
})

describe('App: harita sayfası', () => {
  it('yıl rozeti yıl sayfasına bağlanır', () => {
    renderAt('/yil/1453')
    const badge = screen.getByRole('link', { name: 'Yılı değiştir: 1453' })
    expect(badge).toHaveTextContent('1453')
    fireEvent.click(badge)
    expect(url()).toBe('/')
  })

  it('seçim yokken "Sahneyi gör" pasif; il seçilince URL /yer/34, özet ve aktif düğme; ilçe seçilince /yer/34-beyoglu', async () => {
    renderAt('/yil/1453')
    expect(seeScene()).toBeDisabled()
    expect(summary()).toHaveTextContent('Haritadan ya da aramadan bir il seç.')
    await mapReady()
    clickProvince('34')
    expect(url()).toBe('/yil/1453/yer/34')
    expect(summary()).toHaveTextContent('İstanbul · 4 ilçe · ilçe seçmek isteğe bağlı')
    expect(seeScene()).toBeEnabled()
    clickDistrict('34-beyoglu')
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
    expect(summary()).toHaveTextContent('Beyoğlu, İstanbul')
    expect(screen.getByRole('combobox')).toHaveValue('Beyoğlu, İstanbul')
  })

  it('harita içindeki seçim replace eder: geri tuşu yıl sayfasına döner; harita yeniden kurulmaz', async () => {
    renderAt('/')
    fireEvent.click(goToYear())
    await mapReady()
    const created = maps.created
    clickProvince('34')
    clickDistrict('34-kadikoy')
    clickProvince('06')
    expect(url()).toBe('/yil/2026/yer/06')
    expect(maps.created).toBe(created)
    browserBack()
    expect(url()).toBe('/')
  })

  it('aramadan seçim de URL\'ye yazılır', async () => {
    renderAt('/yil/1453')
    const box = await screen.findByRole('combobox')
    await waitFor(() => expect(box).toBeEnabled())
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'ankara' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(url()).toBe('/yil/1453/yer/06')
    expect(summary()).toHaveTextContent('Ankara · 1 ilçe · ilçe seçmek isteğe bağlı')
  })

  it('URL\'deki yer çözülür ve haritada seçili gösterilir (derin bağlantı)', async () => {
    renderAt('/yil/1453/yer/34-beyoglu')
    await mapReady()
    expect(summary()).toHaveTextContent('Beyoğlu, İstanbul')
    expect(maps.setFeatureState).toHaveBeenCalledWith({ source: 'districts', id: '34-beyoglu' }, { selected: true })
    expect(maps.setFeatureState).toHaveBeenCalledWith({ source: 'provinces', id: '34' }, { selected: true })
    expect(seeScene()).toBeEnabled()
  })

  it.each(['/yil/1453/yer/99', '/yil/1453/yer/34-yok'])('bilinmeyen yer %s → mesaj ve /yil/1453 (replace)', async (path) => {
    renderAt('/', path)
    await waitFor(() => expect(url()).toBe('/yil/1453'))
    expect(screen.getByRole('alert')).toHaveTextContent('Bu yer bağlantısı geçersiz. Haritadan bir yer seç.')
    expect(seeScene()).toBeDisabled()
    browserBack()
    expect(url()).toBe('/')
  })
})

describe('App: sahne sayfası', () => {
  it('"Sahneyi gör" push eder; istek ilçe merkeziyle gider; geri tuşu seçimi koruyarak haritaya döner', async () => {
    const fetchMock = stubFetch()
    await openBeyogluScene()
    expect(url()).toBe('/yil/1453/yer/34-beyoglu/sahne')
    expect(postBody(fetchMock)).toEqual(BEYOGLU_BODY)
    browserBack()
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
    expect(summary()).toHaveTextContent('Beyoğlu, İstanbul')
  })

  it('yalnızca il seçiliyse istek il merkeziyle gider; MÖ yıl isteğe geçer', async () => {
    const fetchMock = stubFetch()
    renderAt('/yil/mo-1200')
    await mapReady()
    clickProvince('34')
    fireEvent.click(seeScene())
    await tick(0)
    expect(url()).toBe('/yil/mo-1200/yer/34/sahne')
    expect(postBody(fetchMock)).toEqual({ year: -1200, latitude: 41.01, longitude: 28.96028 })
  })

  it('yükleme ekranı 300 ms gecikmeyle gelir; aşamaları ve geçen süreyi gösterir', async () => {
    stubFetch(
      sequence(
        () => json(scene('PENDING'), 202),
        () => json(scene('RUNNING', { stage: 'LOCATING' })),
        () => json(scene('RUNNING', { stage: 'DEPTH' })),
        () => json(readyScene()),
      ),
    )
    await openBeyogluScene()
    expect(loader()).not.toBeInTheDocument()
    await tick(300)
    const screenEl = loader()!
    expect(screenEl).toBeInTheDocument()
    expect(within(screenEl).getByText('2026 → 1453')).toBeInTheDocument()
    expect(within(screenEl).getByText('İlçe bulunuyor')).toHaveAttribute('aria-current', 'step')
    await tick(1000)
    expect(within(screenEl).getByText('Derinlik hesaplanıyor')).toHaveAttribute('aria-current', 'step')
    expect(within(screenEl).getByText(/^1 sn/)).toBeInTheDocument()
    await tick(1000)
    expect(loader()).not.toBeInTheDocument()
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
    // Yükleme ekranından geçildi: daire açılışı; animasyon bitmese de en geç 800 ms'de sınıf kalkar.
    expect(screen.getByTestId('scene-stage')).toHaveClass('scene-stage--reveal')
    fireEvent(screen.getByTestId('viewer'), new Event('animationend', { bubbles: true })) // iç öğeden kabarcıklanan olay sayılmaz
    expect(screen.getByTestId('scene-stage')).toHaveClass('scene-stage--reveal')
    await tick(800)
    expect(screen.getByTestId('scene-stage')).not.toHaveClass('scene-stage--reveal')
  })

  it('açılış animasyonu bitince kırpma sınıfı kalkar', async () => {
    stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(scene('RUNNING')), () => json(readyScene())))
    await openBeyogluScene()
    await tick(300) // yükleme ekranı görünür
    expect(loader()).toBeInTheDocument()
    await tick(700)
    const stage = screen.getByTestId('scene-stage')
    expect(stage).toHaveClass('scene-stage--reveal')
    fireEvent(stage, new Event('animationend', { bubbles: true }))
    expect(stage).not.toHaveClass('scene-stage--reveal')
  })

  it('önbellekteki sahne (ilk yoklamada READY) yükleme ekranını hiç göstermez', async () => {
    stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(readyScene())))
    await openBeyogluScene()
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
    // Doğrudan READY: açılış animasyonu yok, görüntüleyici hiç kırpılmaz.
    expect(screen.getByTestId('scene-stage')).not.toHaveClass('scene-stage--reveal')
    await tick(400)
    expect(loader()).not.toBeInTheDocument()
    expect(screen.getByTestId('scene-stage')).not.toHaveClass('scene-stage--reveal')
  })

  it('READY: tam ekran görüntüleyici + katmanlar (yer, yıl/dönem notu, rozet, atıf); görüntüleyicinin tam ekran düğmesi kapalı', async () => {
    stubFetch(
      sequence(
        () => json(scene('PENDING'), 202),
        () =>
          json(
            readyScene({
              place: { province: 'İstanbul', district: 'Beyoğlu' },
              attribution: { author: 'ayse', license: 'CC BY-SA 4.0', licenseUrl: null, sourceUrl: null, provider: 'mapillary' },
            }),
          ),
      ),
    )
    await openBeyogluScene()
    expect(screen.getByRole('heading', { name: 'Beyoğlu, İstanbul' })).toBeInTheDocument()
    expect(screen.getByText('1453 seçildi · Şimdilik 2026 görünümü; Osmanlı klasik sahnesi hazırlanıyor')).toBeInTheDocument()
    expect(screen.getByText('360°')).toBeInTheDocument()
    expect(screen.getByText('Görsel: ayse · CC BY-SA 4.0 · Mapillary')).toBeInTheDocument()
    const viewer = screen.getByTestId('viewer')
    expect(viewer).toHaveAttribute('data-kind', 'panorama')
    expect(viewer).toHaveAttribute('data-fs', 'false')
    expect(screen.getByRole('img', { name: 'Üretilen panorama: 1453, Beyoğlu, İstanbul' })).toHaveAttribute('src', '/p.jpg')
    expect(screen.getByTestId('scene-stage')).toBeInTheDocument()
  })

  it('kind photo → 2.5B görüntüleyici ve rozet', async () => {
    stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(readyScene({ kind: 'photo' }))))
    await openBeyogluScene()
    const viewer = screen.getByTestId('viewer')
    expect(viewer).toHaveAttribute('data-kind', 'photo')
    expect(viewer).toHaveAttribute('data-depth', '/d.png')
    expect(screen.getByText('2.5B')).toBeInTheDocument()
  })

  it('katmanlar: "←" haritaya geri, "Yer ✎" haritaya, "Yıl ✎" yıl sayfasına', async () => {
    stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(readyScene())))
    await openBeyogluScene()
    fireEvent.click(screen.getByRole('button', { name: 'Haritaya dön' }))
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
    fireEvent.click(seeScene())
    await tick(0)
    fireEvent.click(screen.getByRole('button', { name: 'Yeri değiştir: Beyoğlu' }))
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
  })

  it('"Yıl ✎" yıl sayfasına gider', async () => {
    stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(readyScene())))
    await openBeyogluScene()
    fireEvent.click(screen.getByRole('button', { name: 'Yılı değiştir: 1453' }))
    expect(url()).toBe('/')
  })

  it('paylaşım bağlantısı sahnenin tam adresidir', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(readyScene())))
    await openBeyogluScene()
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı kopyala' }))
    await tick(0)
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/yil/1453/yer/34-beyoglu/sahne`)
  })

  it('FAILED görsel yok → hata ekranı ve en yakın 3 ilçe önerisi (mesafeye göre); öneri yeni sahneyi açar', async () => {
    const fetchMock = stubFetch(
      sequence(
        () => json(scene('PENDING'), 202),
        () => json(scene('FAILED', { error: 'no image found for location' })),
        () => json(scene('PENDING'), 202),
        () => json(readyScene()),
      ),
    )
    await openBeyogluScene()
    expect(screen.getByRole('alert')).toHaveTextContent('Bu ilçe için görsel bulunamadı')
    expect(screen.queryByText(/no image found/)).not.toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Yakındaki ilçeler' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['Şişli, İstanbul', 'Fatih, İstanbul', 'Kadıköy, İstanbul'])
    expect(links[1]).toHaveAttribute('href', '/yil/1453/yer/34-fatih/sahne')
    fireEvent.click(links[1])
    await tick(0)
    expect(url()).toBe('/yil/1453/yer/34-fatih/sahne')
    expect(postBody(fetchMock, 1)).toEqual({ year: 1453, latitude: 41.0186, longitude: 28.9397 })
    expect(screen.getByRole('heading', { name: 'Fatih, İstanbul' })).toBeInTheDocument()
    // Öneriyle gelinen sahnede "←" önerilen yerin haritasına gider (replace).
    fireEvent.click(screen.getByRole('button', { name: 'Haritaya dön' }))
    expect(url()).toBe('/yil/1453/yer/34-fatih')
  })

  it('FAILED dönem yok → "Bu dönem için sahne henüz yok.", "Tekrar dene" yok', async () => {
    stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(scene('FAILED', { error: 'no scene for period' }))))
    await openBeyogluScene('/yil/mo-50000')
    expect(screen.getByRole('alert')).toHaveTextContent('Bu dönem için sahne henüz yok.')
    expect(screen.queryByRole('button', { name: 'Tekrar dene' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Yakındaki ilçeler' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Haritaya dön' }))
    expect(url()).toBe('/yil/mo-50000/yer/34-beyoglu')
  })

  it('FAILED bilinmeyen → genel hata, ham metin yok; "Tekrar dene" üretimi yeniden başlatır', async () => {
    const fetchMock = stubFetch(
      sequence(
        () => json(scene('PENDING'), 202),
        () => json(scene('FAILED', { error: 'boom internal' })),
        () => json(scene('PENDING'), 202),
        () => json(readyScene()),
      ),
    )
    await openBeyogluScene()
    expect(screen.getByRole('alert')).toHaveTextContent('Sahne üretilemedi')
    expect(screen.queryByText(/boom internal/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(loader()).toBeInTheDocument() // yeniden denemede gecikme yok
    await tick(0)
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
    expect(posts(fetchMock)).toHaveLength(2)
  })

  it('ağ hatası → "Sunucuya ulaşılamadı"', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    await openBeyogluScene()
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı')
  })

  it('POST 400 → genel hata; Türkiye dışı ya da sunucu metni gösterilmez', async () => {
    stubFetch(() => json({ error: 'location outside supported area' }, 400))
    await openBeyogluScene()
    expect(screen.getByRole('alert')).toHaveTextContent('Sahne üretilemedi')
    expect(screen.queryByText(/Türkiye|outside supported area/)).not.toBeInTheDocument()
  })

  it.each([404, 500])('yoklamada HTTP %i → genel hata, sunucu metni yok', async (code) => {
    stubFetch(sequence(() => json(scene('PENDING'), 202), () => json({ error: 'scene not found upstream' }, code)))
    await openBeyogluScene()
    expect(screen.getByRole('alert')).toHaveTextContent('Sahne üretilemedi')
    expect(screen.queryByText(/upstream/)).not.toBeInTheDocument()
  })

  it('READY ama sonuç yoksa genel hata', async () => {
    stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(scene('READY'))))
    await openBeyogluScene()
    expect(screen.getByRole('alert')).toHaveTextContent('Sahne üretilemedi')
  })

  it('120 sn içinde bitmezse "Üretim çok uzun sürdü"', async () => {
    stubFetch((_u, init) => json(scene(init?.method === 'POST' ? 'PENDING' : 'RUNNING', init?.method === 'POST' ? {} : { stage: 'DEPTH' })))
    await openBeyogluScene()
    await tick(121_000)
    expect(screen.getByRole('alert')).toHaveTextContent('Üretim çok uzun sürdü')
  })

  it('POST 503: "Sunucu meşgul" geri sayımı (Retry-After), sonra kendiliğinden yeniden dener', async () => {
    const fetchMock = stubFetch(
      sequence(
        () => json({ error: 'busy' }, 503, { 'Retry-After': '4' }),
        () => json(scene('PENDING'), 202),
        () => json(readyScene()),
      ),
    )
    await openBeyogluScene()
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucu meşgul, 4 sn sonra yeniden denenecek')
    await tick(1000)
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucu meşgul, 3 sn sonra yeniden denenecek')
    await tick(2900)
    // Son saniyede de süre gösterilir; süresiz "Sunucu meşgul" yalnızca denemeler bitince.
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucu meşgul, 1 sn sonra yeniden denenecek')
    await tick(100)
    expect(posts(fetchMock)).toHaveLength(2)
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
  })

  it('POST 503 dört kez → süre vermeden "Sunucu meşgul" ve yalnızca "Tekrar dene"', async () => {
    const fetchMock = stubFetch(() => json({ error: 'busy' }, 503, { 'Retry-After': '1' }))
    await openBeyogluScene()
    await tick(3000)
    expect(posts(fetchMock)).toHaveLength(4)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Sunucu meşgul')
    expect(alert).not.toHaveTextContent(/sn sonra/)
    await tick(5000)
    expect(posts(fetchMock)).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    await tick(0)
    expect(posts(fetchMock)).toHaveLength(5)
  })

  it('meşgulken "Tekrar dene" beklemeden yeniden ister', async () => {
    const fetchMock = stubFetch(
      sequence(() => json({ error: 'busy' }, 503, { 'Retry-After': '20' }), () => json(scene('PENDING'), 202), () => json(readyScene())),
    )
    await openBeyogluScene()
    expect(screen.getByRole('alert')).toHaveTextContent('20 sn')
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    await tick(0)
    expect(posts(fetchMock)).toHaveLength(2)
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
  })

  it('yoklamada 503 → meşgul geri sayımı, sonraki yoklamada READY', async () => {
    stubFetch(
      sequence(
        () => json(scene('PENDING'), 202),
        () => json(scene('RUNNING', { stage: 'IMAGE_SEARCH' })),
        () => json({ error: 'busy' }, 503),
        () => json(readyScene()),
      ),
    )
    await openBeyogluScene()
    await tick(1000)
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucu meşgul, 5 sn sonra yeniden denenecek')
    await tick(5000)
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('yoklamada 503 Retry-After okunur; bekleme bitince yükleme ekranı aşamayla döner', async () => {
    const fetchMock = stubFetch(
      sequence(
        () => json(scene('PENDING'), 202),
        () => json(scene('RUNNING', { stage: 'IMAGE_SEARCH' })),
        () => json({ error: 'busy' }, 503, { 'Retry-After': '3' }),
        () => json(scene('RUNNING', { stage: 'DEPTH' })),
        () => json(readyScene()),
      ),
    )
    await openBeyogluScene()
    await tick(1000)
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucu meşgul, 3 sn sonra yeniden denenecek')
    await tick(3000)
    expect(within(loader()!).getByText('Derinlik hesaplanıyor')).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await tick(1000)
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
    // Yoklama aynı işi sürdürür: yeni POST yok.
    expect(posts(fetchMock)).toHaveLength(1)
    expect(apiCalls(fetchMock).slice(1).every(([u]) => u === '/api/scenes/s1')).toBe(true)
  })

  it('yoklamada 503 sürerse 120 sn sonunda "Üretim çok uzun sürdü"', async () => {
    stubFetch((_u, init) => (init?.method === 'POST' ? json(scene('PENDING'), 202) : json({ error: 'busy' }, 503, { 'Retry-After': '5' })))
    await openBeyogluScene()
    await tick(119_000)
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucu meşgul')
    await tick(2000)
    expect(screen.getByRole('alert')).toHaveTextContent('Üretim çok uzun sürdü')
  })

  it.each(['READY', 'FAILED'])('POST hemen %s dönerse yoklama yapılmaz', async (status) => {
    const fetchMock = stubFetch(() =>
      json(status === 'READY' ? readyScene() : scene('FAILED', { error: 'no scene for period' }), 200),
    )
    await openBeyogluScene()
    if (status === 'READY') expect(screen.getByTestId('viewer')).toBeInTheDocument()
    else expect(screen.getByRole('alert')).toHaveTextContent('Bu dönem için sahne henüz yok.')
    await tick(5000)
    expect(apiCalls(fetchMock)).toHaveLength(1)
  })

  it('yükleme sırasında "Vazgeç" isteği iptal eder ve seçimi koruyarak haritaya döner', async () => {
    const signals: AbortSignal[] = []
    stubFetch((_u, init) => {
      if (init?.signal && init.method !== 'POST') signals.push(init.signal)
      return json(scene(init?.method === 'POST' ? 'PENDING' : 'RUNNING'))
    })
    await openBeyogluScene()
    await tick(300)
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((s) => !s.aborted)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
    expect(signals.every((s) => s.aborted)).toBe(true)
    expect(summary()).toHaveTextContent('Beyoğlu, İstanbul')
  })

  it('yükleme sırasında tarayıcı geri tuşu yoklamayı iptal eder', async () => {
    const signals: AbortSignal[] = []
    stubFetch((_u, init) => {
      if (init?.signal && init.method !== 'POST') signals.push(init.signal)
      return json(scene(init?.method === 'POST' ? 'PENDING' : 'RUNNING'))
    })
    await openBeyogluScene()
    browserBack()
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  it('unmount olunca yoklamayı iptal eder', async () => {
    const signals: AbortSignal[] = []
    stubFetch((_u, init) => {
      if (init?.signal && init.method !== 'POST') signals.push(init.signal)
      return json(scene(init?.method === 'POST' ? 'PENDING' : 'RUNNING'))
    })
    await openBeyogluScene()
    cleanup()
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  it('StrictMode altında tek POST atar', async () => {
    const fetchMock = stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(readyScene())))
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/yil/1453/yer/34-beyoglu/sahne']}>
          <AppRoutes />
        </MemoryRouter>
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTestId('viewer')).toBeInTheDocument())
    expect(posts(fetchMock)).toHaveLength(1)
  })
})

describe('App: sahne derin bağlantısı', () => {
  it('/yil/1453/yer/34-beyoglu/sahne doğrudan açılır; "←" üst rotaya replace eder', async () => {
    const fetchMock = stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(readyScene())))
    renderAt('/yil/1453/yer/34-beyoglu/sahne')
    await waitFor(() => expect(screen.getByTestId('viewer')).toBeInTheDocument())
    expect(postBody(fetchMock)).toEqual(BEYOGLU_BODY)
    expect(screen.getByTestId('scene-stage')).not.toHaveClass('scene-stage--reveal')
    fireEvent.click(screen.getByRole('button', { name: 'Haritaya dön' }))
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
    browserBack() // replace edildiyse geride sahne kalmamıştır
    expect(url()).toBe('/yil/1453/yer/34-beyoglu')
  })

  it('yer verisi gelene kadar yükleme ekranı; istek atılmaz', async () => {
    let open!: () => void
    geoGate = new Promise((r) => (open = r))
    const fetchMock = stubFetch(sequence(() => json(scene('PENDING'), 202), () => json(readyScene())))
    renderAt('/yil/1453/yer/34-beyoglu/sahne')
    await tick(300)
    expect(loader()).toBeInTheDocument()
    expect(posts(fetchMock)).toHaveLength(0)
    open()
    await waitFor(() => expect(screen.getByTestId('viewer')).toBeInTheDocument())
    expect(posts(fetchMock)).toHaveLength(1)
  })

  it('derin bağlantıda "Vazgeç" de üst rotaya replace eder', async () => {
    stubFetch((_u, init) => json(scene(init?.method === 'POST' ? 'PENDING' : 'RUNNING')))
    renderAt('/yil/1453/yer/34/sahne')
    await tick(300)
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(url()).toBe('/yil/1453/yer/34')
    browserBack()
    expect(url()).toBe('/yil/1453/yer/34')
  })

  it('bilinmeyen yer → haritaya yönlendirir ve mesaj gösterir, istek atmaz', async () => {
    const fetchMock = stubFetch()
    renderAt('/yil/1453/yer/99/sahne')
    await waitFor(() => expect(url()).toBe('/yil/1453'))
    expect(screen.getByRole('alert')).toHaveTextContent('Bu yer bağlantısı geçersiz. Haritadan bir yer seç.')
    expect(posts(fetchMock)).toHaveLength(0)
  })

  it('yer verisi yüklenemezse ağ hatası ekranı; "Tekrar dene" veriyi yeniden ister', async () => {
    let fail = true
    const fn = vi.fn(async (u: string, init?: RequestInit) => {
      if (u in GEO) return fail ? new Response('x', { status: 500 }) : json(GEO[u])
      return init?.method === 'POST' ? json(scene('PENDING'), 202) : json(readyScene())
    })
    vi.stubGlobal('fetch', fn)
    renderAt('/yil/1453/yer/34-beyoglu/sahne')
    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    await waitFor(() => expect(screen.getByTestId('viewer')).toBeInTheDocument())
  })

  it('kanonik olmayan yıl yönlendirilir, derin bağlantı bilgisi korunur', async () => {
    stubFetch()
    renderAt('/yil/-1453/yer/34/sahne')
    expect(url()).toBe('/yil/mo-1453/yer/34/sahne')
    await tick(300)
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(url()).toBe('/yil/mo-1453/yer/34')
  })
})
