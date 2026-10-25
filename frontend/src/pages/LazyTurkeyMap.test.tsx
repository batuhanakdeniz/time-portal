import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LazyTurkeyMap } from './LazyTurkeyMap'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const Fake = ({ selected }: { selected: { province: string } | null }) => <div>harita {selected?.province ?? 'yok'}</div>

describe('LazyTurkeyMap', () => {
  it('parça yüklenirken bilgi gösterir, sonra haritayı props ile çizer (Suspense olmadan)', async () => {
    const loader = vi.fn(() => Promise.resolve(Fake))
    render(
      <LazyTurkeyMap
        selected={{ plate: '34', province: 'İstanbul', center: { lat: 41, lon: 29 } }}
        onSelect={vi.fn()}
        loader={loader}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Harita yükleniyor…')
    expect(await screen.findByText('harita İstanbul')).toBeInTheDocument()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('parça yüklenemezse mesaj ve "Tekrar dene" yeniden yükler', async () => {
    let fail = true
    const loader = vi.fn(() => (fail ? Promise.reject(new Error('chunk yok')) : Promise.resolve(Fake)))
    render(<LazyTurkeyMap selected={null} onSelect={vi.fn()} loader={loader} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Harita yüklenemedi. İl ya da ilçeyi aramadan seçebilirsin. Tekrar dene ya da sayfayı yenile.',
    )
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('harita yok')).toBeInTheDocument()
  })

  it('harita çizilirken hata atarsa uygulama çökmez, mesaj gösterilir', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Broken = () => {
      throw new Error('WebGL')
    }
    render(<LazyTurkeyMap selected={null} onSelect={vi.fn()} loader={() => Promise.resolve(Broken)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Harita yüklenemedi')
  })
})
