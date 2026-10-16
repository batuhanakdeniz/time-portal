import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ClickEvent = { lngLat: { lng: number; lat: number } }

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (e?: ClickEvent) => void>,
  remove: vi.fn(),
  markerSetLngLat: vi.fn(),
  markerRemove: vi.fn(),
  fail: false,
  setWorkerUrl: vi.fn(),
}))

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({ default: '/assets/worker.mjs' }))

vi.mock('maplibre-gl', () => {
  class Map {
    constructor() {
      if (mocks.fail) throw new Error('WebGL yok')
    }
    on(type: string, fn: (e?: ClickEvent) => void) {
      mocks.handlers[type] = fn
    }
    remove() {
      mocks.remove()
    }
  }
  class Marker {
    setLngLat(pos: [number, number]) {
      mocks.markerSetLngLat(pos)
      return this
    }
    addTo() {
      return this
    }
    remove() {
      mocks.markerRemove()
    }
  }
  return { Map, Marker, setWorkerUrl: mocks.setWorkerUrl }
})

import { LocationPicker } from './LocationPicker'

afterEach(cleanup)

beforeEach(() => {
  mocks.fail = false
  mocks.remove.mockClear()
  mocks.markerSetLngLat.mockClear()
  mocks.markerRemove.mockClear()
  for (const k of Object.keys(mocks.handlers)) delete mocks.handlers[k]
})

const lat = () => screen.getByLabelText('Enlem') as HTMLInputElement
const lng = () => screen.getByLabelText('Boylam') as HTMLInputElement

describe('LocationPicker', () => {
  it('harita kurulmadan önce worker adresini bir kez ayarlar', () => {
    render(<LocationPicker value={null} onChange={vi.fn()} />)
    expect(mocks.setWorkerUrl).toHaveBeenCalledWith('/assets/worker.mjs')
    cleanup()
    render(<LocationPicker value={null} onChange={vi.fn()} />)
    expect(mocks.setWorkerUrl).toHaveBeenCalledTimes(1)
  })

  it('geçerli sayı girişi onChange çağırır', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    fireEvent.change(lat(), { target: { value: '41.9' } })
    fireEvent.change(lng(), { target: { value: '12.5' } })
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 41.9, longitude: 12.5 })
  })

  it('geçersiz değerde hata gösterir, erişilebilirlik özniteliklerini koyar, onChange çağırmaz', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    fireEvent.change(lat(), { target: { value: '95' } })
    fireEvent.change(lng(), { target: { value: '12' } })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Enlem')
    expect(lat()).toHaveAttribute('aria-invalid', 'true')
    expect(lat()).toHaveAttribute('aria-describedby', alert.id)
    expect(lng()).not.toHaveAttribute('aria-invalid')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('harita kabı adlandırılmış bölge', () => {
    render(<LocationPicker value={null} onChange={() => {}} />)
    expect(screen.getByRole('region', { name: 'Dünya haritası' })).toBeInTheDocument()
  })

  it('harita tıklaması normalize edilmiş değerle onChange çağırır ve alanları günceller', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    fireEvent.change(lat(), { target: { value: '95' } })
    act(() => mocks.handlers.click({ lngLat: { lng: 190.123456, lat: 41.9 } }))
    expect(onChange).toHaveBeenCalledWith({ latitude: 41.9, longitude: -169.8765 })
    expect(lat().value).toBe('41.9')
    expect(lng().value).toBe('-169.8765')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('seçili konumu biçimlendirip gösterir ve işaretçiyi koyar', () => {
    render(<LocationPicker value={{ latitude: 41.9, longitude: 12.5 }} onChange={() => {}} />)
    expect(screen.getByText('41.9000° K, 12.5000° D')).toBeInTheDocument()
    expect(mocks.markerSetLngLat).toHaveBeenLastCalledWith([12.5, 41.9])
  })

  it('value null olunca işaretçi kaldırılır ve alanlar boşalır', () => {
    const { rerender } = render(<LocationPicker value={{ latitude: 41.9, longitude: 12.5 }} onChange={() => {}} />)
    rerender(<LocationPicker value={null} onChange={() => {}} />)
    expect(mocks.markerRemove).toHaveBeenCalled()
    expect(lat().value).toBe('')
    expect(lng().value).toBe('')
  })

  it('value prop değişince alanlar eşitlenir ve işaretçi taşınır', () => {
    const { rerender } = render(<LocationPicker value={{ latitude: 1, longitude: 2 }} onChange={() => {}} />)
    rerender(<LocationPicker value={{ latitude: 35.6762, longitude: 139.6503 }} onChange={() => {}} />)
    expect(lat().value).toBe('35.6762')
    expect(lng().value).toBe('139.6503')
    expect(mocks.markerSetLngLat).toHaveBeenLastCalledWith([139.6503, 35.6762])
  })

  it('onChange prop değişince yeni callback çağrılır', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<LocationPicker value={null} onChange={first} />)
    rerender(<LocationPicker value={null} onChange={second} />)
    act(() => mocks.handlers.click({ lngLat: { lng: 10, lat: 20 } }))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith({ latitude: 20, longitude: 10 })
  })

  it('stil yüklenemezse hata gösterir, girişler çalışır', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    act(() => mocks.handlers.error())
    return screen.findByText(/Harita yüklenemedi/).then(() => {
      fireEvent.change(lat(), { target: { value: '10' } })
      fireEvent.change(lng(), { target: { value: '20' } })
      expect(onChange).toHaveBeenLastCalledWith({ latitude: 10, longitude: 20 })
    })
  })

  it('stil yüklendikten sonraki hata mesaj göstermez', () => {
    render(<LocationPicker value={null} onChange={() => {}} />)
    act(() => mocks.handlers.load())
    act(() => mocks.handlers.error())
    expect(screen.queryByText(/Harita yüklenemedi/)).toBeNull()
  })

  it('harita kurulumu hata verirse çökmez, girişler çalışır', () => {
    mocks.fail = true
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    expect(screen.getByText(/Harita yüklenemedi/)).toBeInTheDocument()
    fireEvent.change(lat(), { target: { value: '10' } })
    fireEvent.change(lng(), { target: { value: '20' } })
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 10, longitude: 20 })
  })

  it('unmount olunca haritayı kaldırır', () => {
    const { unmount } = render(<LocationPicker value={null} onChange={() => {}} />)
    unmount()
    expect(mocks.remove).toHaveBeenCalled()
  })
})
