import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ViewerSection } from './ViewerSection'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ViewerSection', () => {
  it('parça yüklenirken bilgi gösterir, sonra görüntüleyiciyi çizer', async () => {
    const loader = () => Promise.resolve({ default: ({ src, alt }: { src: string; alt: string }) => <div>görüntüleyici {src} {alt}</div> })
    render(<ViewerSection src="/p.png" alt="Roma" loader={loader} />)
    expect(screen.getByText('3B görüntüleyici yükleniyor…')).toBeInTheDocument()
    expect(await screen.findByText('görüntüleyici /p.png Roma')).toBeInTheDocument()
  })

  it('parça yüklenemezse düz önizlemeye düşer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const loader = () => Promise.reject(new Error('chunk yok'))
    render(<ViewerSection src="/p.png" alt="Roma" loader={loader} />)
    const img = await screen.findByRole('img', { name: 'Roma' })
    expect(img).toHaveAttribute('src', '/p.png')
    expect(screen.getByText('Roma', { selector: 'figcaption' })).toBeInTheDocument()
  })

  it('gerçek görüntüleyici WebGL yokken (jsdom) düz önizleme gösterir', async () => {
    render(<ViewerSection src="/p.png" alt="Roma" />)
    expect(await screen.findByText('3B görüntüleme desteklenmiyor, düz önizleme gösteriliyor', {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Roma' })).toHaveAttribute('src', '/p.png')
  }, 15000)
})
