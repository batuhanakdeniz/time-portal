import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ClickEvent = { lngLat: { lng: number; lat: number } }

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: ClickEvent) => void>,
  remove: vi.fn(),
  fail: false,
}))

vi.mock('maplibre-gl', () => {
  class Map {
    constructor() {
      if (mocks.fail) throw new Error('WebGL yok')
    }
    on(type: string, fn: (e: ClickEvent) => void) {
      mocks.handlers[type] = fn
    }
    remove() {
      mocks.remove()
    }
  }
  class Marker {
    setLngLat() {
      return this
    }
    addTo() {
      return this
    }
    remove() {}
  }
  return { Map, Marker }
})

import { LocationPicker } from './LocationPicker'

afterEach(cleanup)

beforeEach(() => {
  mocks.fail = false
  mocks.remove.mockClear()
  for (const k of Object.keys(mocks.handlers)) delete mocks.handlers[k]
})

describe('LocationPicker', () => {
  it('geçerli sayı girişi onChange çağırır', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Enlem'), { target: { value: '41.9' } })
    fireEvent.change(screen.getByLabelText('Boylam'), { target: { value: '12.5' } })
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 41.9, longitude: 12.5 })
  })

  it('geçersiz değerde hata gösterir, onChange çağırmaz', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Enlem'), { target: { value: '95' } })
    fireEvent.change(screen.getByLabelText('Boylam'), { target: { value: '12' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Enlem')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('harita tıklaması normalize edilmiş değerle onChange çağırır', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    mocks.handlers.click({ lngLat: { lng: 190.123456, lat: 41.9 } })
    expect(onChange).toHaveBeenCalledWith({ latitude: 41.9, longitude: -169.8765 })
  })

  it('seçili konumu biçimlendirip gösterir', () => {
    render(<LocationPicker value={{ latitude: 41.9, longitude: 12.5 }} onChange={() => {}} />)
    expect(screen.getByText('41.9000° K, 12.5000° D')).toBeInTheDocument()
  })

  it('harita kurulumu hata verirse çökmez, girişler çalışır', () => {
    mocks.fail = true
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    expect(screen.getByText(/Harita yüklenemedi/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Enlem'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Boylam'), { target: { value: '20' } })
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 10, longitude: 20 })
  })

  it('unmount olunca haritayı kaldırır', () => {
    const { unmount } = render(<LocationPicker value={null} onChange={() => {}} />)
    unmount()
    expect(mocks.remove).toHaveBeenCalled()
  })
})
