import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MapSection } from './MapSection'

afterEach(cleanup)

describe('MapSection', () => {
  it('yüklenirken fallback, sonra seçiciyi gösterir', async () => {
    render(<MapSection value={null} onChange={vi.fn()} loader={async () => ({ default: () => <p>seçici</p> })} />)
    expect(screen.getByText('Harita yükleniyor…')).toBeInTheDocument()
    expect(await screen.findByText('seçici')).toBeInTheDocument()
  })

  it('parça yüklenemezse hata gösterir, Tekrar dene ile yeniden yükler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk yok'))
      .mockResolvedValueOnce({ default: () => <p>seçici</p> })
    render(
      <div>
        <h1>Uygulama</h1>
        <MapSection value={null} onChange={vi.fn()} loader={loader} />
      </div>,
    )
    expect(await screen.findByText('Harita yüklenemedi')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Uygulama' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('seçici')).toBeInTheDocument()
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
