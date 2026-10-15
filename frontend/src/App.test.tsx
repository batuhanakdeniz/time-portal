import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from './App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('backend UP dönünce çalışıyor gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'UP' }) }))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Time Portal' })).toBeInTheDocument()
    expect(await screen.findByText('Backend çalışıyor')).toBeInTheDocument()
  })

  it('backend erişilemezse hata gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ağ hatası')))
    render(<App />)
    expect(await screen.findByText('Backend erişilemiyor')).toBeInTheDocument()
  })
})
