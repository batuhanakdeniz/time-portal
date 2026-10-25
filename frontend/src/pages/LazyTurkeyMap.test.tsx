import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LazyTurkeyMap } from './LazyTurkeyMap'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const Fake = ({ selected }: { selected: { province: string } | null }) => <div>harita {selected?.province ?? 'yok'}</div>

describe('LazyTurkeyMap', () => {
  it('parça yüklenirken bilgi gösterir, sonra haritayı props ile çizer', async () => {
    const onSelect = vi.fn()
    render(
      <LazyTurkeyMap
        selected={{ plate: '34', province: 'İstanbul', center: { lat: 41, lon: 29 } }}
        onSelect={onSelect}
        loader={() => Promise.resolve({ default: Fake })}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Harita yükleniyor…')
    expect(await screen.findByText('harita İstanbul')).toBeInTheDocument()
  })

  it('parça yüklenemezse mesaj ve "Tekrar dene" yeniden yükler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let fail = true
    const loader = vi.fn(() => (fail ? Promise.reject(new Error('chunk yok')) : Promise.resolve({ default: Fake })))
    render(<LazyTurkeyMap selected={null} onSelect={vi.fn()} loader={loader} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Harita yüklenemedi. İl ya da ilçeyi aramadan seçebilirsin.')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('harita yok')).toBeInTheDocument()
  })
})
