import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (e?: { features?: { id?: string | number }[] }) => void

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>,
  mapOptions: null as Record<string, unknown> | null,
  setFeatureState: vi.fn(),
  easeTo: vi.fn(),
  cameraForBounds: vi.fn((_b: unknown, _o: unknown) => ({ center: [29, 41], zoom: 8.2 }) as { center: number[]; zoom: number }),
  disableRotation: vi.fn(),
  keyboardDisableRotation: vi.fn(),
  remove: vi.fn(),
  setWorkerUrl: vi.fn(),
  fail: false,
}))

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({ default: '/assets/worker.mjs' }))

vi.mock('maplibre-gl', () => {
  class Map {
    touchZoomRotate = { disableRotation: mocks.disableRotation }
    keyboard = { disableRotation: mocks.keyboardDisableRotation }
    canvas = { style: { cursor: '' } }
    constructor(options: Record<string, unknown>) {
      mocks.mapOptions = options
      if (mocks.fail) throw new Error('WebGL yok')
    }
    on(type: string, layerOrFn: string | Handler, fn?: Handler) {
      if (typeof layerOrFn === 'string') mocks.handlers[`${type}:${layerOrFn}`] = fn!
      else mocks.handlers[type] = layerOrFn
    }
    getCanvas() {
      return this.canvas
    }
    setFeatureState(ref: unknown, state: unknown) {
      mocks.setFeatureState(ref, state)
    }
    cameraForBounds(b: unknown, o: unknown) {
      return mocks.cameraForBounds(b, o)
    }
    easeTo(o: unknown) {
      mocks.easeTo(o)
    }
    remove() {
      mocks.remove()
    }
  }
  return { Map, setWorkerUrl: mocks.setWorkerUrl }
})

import { TurkeyMap } from './TurkeyMap'
import { resetPlacesCache, DISTRICTS_URL, PROVINCES_URL } from './places'
import type { PlaceSelection } from './place'

const sq = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
const fixture: Record<string, unknown> = {
  [PROVINCES_URL]: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: sq, properties: { plate: '34', name: 'İstanbul', minLng: 27.971, minLat: 40.803, maxLng: 29.958, maxLat: 41.591, centerLat: 41.01, centerLon: 28.96028 } },
      { type: 'Feature', geometry: sq, properties: { plate: '06', name: 'Ankara', minLng: 30.5, minLat: 38.7, maxLng: 34.1, maxLat: 40.7, centerLat: 39.92, centerLon: 32.85 } },
    ],
  },
  [DISTRICTS_URL]: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: sq, properties: { key: '34-beyoglu', plate: '34', slug: 'beyoglu', name: 'Beyoğlu', province: 'İstanbul', lat: 41.03194, lon: 28.97611 } },
      { type: 'Feature', geometry: sq, properties: { key: '34-kadikoy', plate: '34', slug: 'kadikoy', name: 'Kadıköy', province: 'İstanbul', lat: 40.99, lon: 29.03 } },
    ],
  },
}

const ISTANBUL: PlaceSelection = { plate: '34', province: 'İstanbul', center: { lat: 41.01, lon: 28.96028 } }
const BEYOGLU: PlaceSelection = {
  plate: '34', province: 'İstanbul',
  district: { slug: 'beyoglu', name: 'Beyoğlu', lat: 41.03194, lon: 28.97611 },
  center: { lat: 41.03194, lon: 28.97611 },
}

let reduceMotion = false

beforeEach(() => {
  resetPlacesCache()
  mocks.fail = false
  mocks.mapOptions = null
  for (const k of Object.keys(mocks.handlers)) delete mocks.handlers[k]
  for (const f of [mocks.setFeatureState, mocks.easeTo, mocks.cameraForBounds, mocks.remove, mocks.disableRotation, mocks.keyboardDisableRotation]) f.mockClear()
  reduceMotion = false
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => fixture[url] }) as Response))
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduceMotion && q.includes('reduce'), media: q }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderLoaded(selected: PlaceSelection | null = null, onSelect = vi.fn()) {
  const utils = render(<TurkeyMap selected={selected} onSelect={onSelect} />)
  await waitFor(() => expect(mocks.mapOptions).not.toBeNull())
  act(() => mocks.handlers.load())
  return { ...utils, onSelect }
}

describe('TurkeyMap', () => {
  it('veri gelene kadar yükleniyor durumu, sonra harita kurulur', async () => {
    render(<TurkeyMap selected={null} onSelect={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Harita yükleniyor')
    await waitFor(() => expect(mocks.mapOptions).not.toBeNull())
    expect(screen.queryByText(/yükleniyor/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Türkiye il ve ilçe haritası' })).toBeInTheDocument()
    expect(mocks.setWorkerUrl).toHaveBeenCalledWith('/assets/worker.mjs')
  })

  it('altlıksız stil, döndürme/eğme kapalı, cooperativeGestures, Türkçe ODbL atfı', async () => {
    await renderLoaded()
    const o = mocks.mapOptions!
    expect(o.dragRotate).toBe(false)
    expect(o.pitchWithRotate).toBe(false)
    expect(o.touchPitch).toBe(false)
    expect(o.cooperativeGestures).toBe(true)
    expect(o.attributionControl).toEqual({ compact: true, customAttribution: '© OpenStreetMap katkıcıları, geoBoundaries (ODbL)' })
    // döndürme hem dokunmada hem klavyede kapalı
    expect(mocks.disableRotation).toHaveBeenCalledTimes(1)
    expect(mocks.keyboardDisableRotation).toHaveBeenCalledTimes(1)
    const locale = o.locale as Record<string, string>
    for (const k of ['CooperativeGesturesHandler.WindowsHelpText', 'CooperativeGesturesHandler.MacHelpText',
      'CooperativeGesturesHandler.MobileHelpText', 'AttributionControl.ToggleAttribution']) {
      expect(locale[k]).toMatch(/[a-zçğıöşü]/i)
    }
    expect(locale['CooperativeGesturesHandler.MobileHelpText']).toBe('Haritayı kaydırmak için iki parmak kullan')
    const style = o.style as { sources: Record<string, { type: string; data: unknown }> }
    expect(Object.keys(style.sources).sort()).toEqual(['districts', 'province-labels', 'provinces'])
    expect(style.sources.provinces.data).toEqual(fixture[PROVINCES_URL])
  })

  it('il tıklaması il merkeziyle onSelect çağırır', async () => {
    const { onSelect } = await renderLoaded()
    act(() => mocks.handlers['click:province-fill']({ features: [{ id: '34' }] }))
    expect(onSelect).toHaveBeenCalledWith(ISTANBUL)
  })

  it('ilçe tıklaması ilçe merkeziyle onSelect çağırır (tıklanan nokta değil)', async () => {
    const { onSelect } = await renderLoaded()
    act(() => mocks.handlers['click:district-fill']({ features: [{ id: '34-beyoglu' }] }))
    expect(onSelect).toHaveBeenCalledWith(BEYOGLU)
  })

  it('bilinmeyen kimlik ya da boş tıklama onSelect çağırmaz', async () => {
    const { onSelect } = await renderLoaded()
    act(() => mocks.handlers['click:province-fill']({ features: [{ id: '99' }] }))
    act(() => mocks.handlers['click:district-fill']({ features: [] }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('selected değişince feature-state senkronlanır ve ile yakınlaşılır', async () => {
    const { rerender } = await renderLoaded()
    expect(mocks.setFeatureState).not.toHaveBeenCalled()

    rerender(<TurkeyMap selected={ISTANBUL} onSelect={vi.fn()} />)
    expect(mocks.setFeatureState).toHaveBeenCalledWith({ source: 'provinces', id: '34' }, { selected: true })
    expect(mocks.cameraForBounds).toHaveBeenCalledWith([[27.971, 40.803], [29.958, 41.591]], { padding: 24, maxZoom: 9 })
    expect(mocks.easeTo).toHaveBeenCalledWith({ center: [29, 41], zoom: 8.2, duration: 600 })

    // Aynı ilde ilçe seçimi: il vurgusu kalır, ilçe eklenir, kamera yeniden hareket etmez
    mocks.setFeatureState.mockClear()
    mocks.easeTo.mockClear()
    rerender(<TurkeyMap selected={BEYOGLU} onSelect={vi.fn()} />)
    expect(mocks.setFeatureState).toHaveBeenCalledWith({ source: 'provinces', id: '34' }, { selected: false })
    expect(mocks.setFeatureState).toHaveBeenLastCalledWith({ source: 'districts', id: '34-beyoglu' }, { selected: true })
    expect(mocks.setFeatureState).toHaveBeenCalledWith({ source: 'provinces', id: '34' }, { selected: true })
    expect(mocks.easeTo).not.toHaveBeenCalled()

    // Seçim kaldırılınca tüm vurgular sönür
    mocks.setFeatureState.mockClear()
    rerender(<TurkeyMap selected={null} onSelect={vi.fn()} />)
    expect(mocks.setFeatureState).toHaveBeenCalledWith({ source: 'districts', id: '34-beyoglu' }, { selected: false })
    expect(mocks.setFeatureState).toHaveBeenCalledWith({ source: 'provinces', id: '34' }, { selected: false })
    expect(mocks.setFeatureState).not.toHaveBeenCalledWith(expect.anything(), { selected: true })
  })

  it('aynı seçimin yeni nesnesi yeniden senkron yapmaz', async () => {
    const { rerender } = await renderLoaded(ISTANBUL)
    mocks.setFeatureState.mockClear()
    rerender(<TurkeyMap selected={{ ...ISTANBUL }} onSelect={vi.fn()} />)
    expect(mocks.setFeatureState).not.toHaveBeenCalled()
  })

  it('başlangıç seçimi (derin bağlantı) yüklemede uygulanır; zoom en az 7', async () => {
    mocks.cameraForBounds.mockReturnValueOnce({ center: [32.5, 37.9], zoom: 6.1 })
    await renderLoaded({ plate: '06', province: 'Ankara', center: { lat: 39.92, lon: 32.85 } })
    expect(mocks.setFeatureState).toHaveBeenCalledWith({ source: 'provinces', id: '06' }, { selected: true })
    expect(mocks.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 7 }))
  })

  it('prefers-reduced-motion: geçiş süresi 0', async () => {
    reduceMotion = true
    await renderLoaded(ISTANBUL)
    expect(mocks.easeTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 0 }))
  })

  it('seçili il yeniden tıklanınca yine yakınlaşır', async () => {
    await renderLoaded(ISTANBUL)
    mocks.easeTo.mockClear()
    act(() => mocks.handlers['click:province-fill']({ features: [{ id: '34' }] }))
    expect(mocks.easeTo).toHaveBeenCalledTimes(1)
  })

  it('hover feature-state ile, öncekini söndürerek', async () => {
    await renderLoaded()
    act(() => mocks.handlers['mousemove:province-fill']({ features: [{ id: '34' }] }))
    expect(mocks.setFeatureState).toHaveBeenLastCalledWith({ source: 'provinces', id: '34' }, { hover: true })
    act(() => mocks.handlers['mousemove:province-fill']({ features: [{ id: '06' }] }))
    expect(mocks.setFeatureState).toHaveBeenCalledWith({ source: 'provinces', id: '34' }, { hover: false })
    act(() => mocks.handlers['mouseleave:province-fill']())
    expect(mocks.setFeatureState).toHaveBeenLastCalledWith({ source: 'provinces', id: '06' }, { hover: false })
  })

  it('harita kurulamazsa aramaya yönlendiren mesaj', async () => {
    mocks.fail = true
    render(<TurkeyMap selected={null} onSelect={vi.fn()} />)
    expect(await screen.findByText(/Harita gösterilemiyor/)).toBeInTheDocument()
  })

  it('veri yüklenemezse hata ve tekrar dene', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    render(<TurkeyMap selected={null} onSelect={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Harita verisi yüklenemedi')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => fixture[url] }) as Response))
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    await waitFor(() => expect(mocks.mapOptions).not.toBeNull())
  })

  it('kaldırılınca harita yok edilir', async () => {
    const { unmount } = await renderLoaded()
    unmount()
    expect(mocks.remove).toHaveBeenCalled()
  })
})
