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

  it('showFullscreenButton görüntüleyiciye geçirilir', async () => {
    const loader = () =>
      Promise.resolve({ default: ({ showFullscreenButton }: { showFullscreenButton?: boolean }) => <div>tam ekran {String(showFullscreenButton)}</div> })
    render(<ViewerSection src="/p.png" alt="Roma" loader={loader} showFullscreenButton={false} />)
    expect(await screen.findByText('tam ekran false')).toBeInTheDocument()
  })

  it('kind photo → fotoğraf görüntüleyici (photoUrl, depthUrl, alt) yüklenir', async () => {
    const photo = vi.fn(({ photoUrl, depthUrl, alt }: { photoUrl: string; depthUrl?: string; alt?: string }) => (
      <div>foto {photoUrl} {depthUrl} {alt}</div>
    ))
    vi.resetModules()
    vi.doMock('./PhotoDepthViewer', () => ({ PhotoDepthViewer: photo }))
    const { ViewerSection: Fresh } = await import('./ViewerSection')
    render(<Fresh src="/p.jpg" depthUrl="/d.png" alt="Roma" kind="photo" />)
    expect(await screen.findByText('foto /p.jpg /d.png Roma')).toBeInTheDocument()
    vi.doUnmock('./PhotoDepthViewer')
  })

  it('kind panorama ya da yok → 360° görüntüleyici', async () => {
    const pano = vi.fn(({ src }: { src: string; alt: string }) => <div>pano {src}</div>)
    vi.resetModules()
    vi.doMock('./PanoramaViewer', () => ({ PanoramaViewer: pano }))
    const { ViewerSection: Fresh } = await import('./ViewerSection')
    render(<Fresh src="/p.jpg" alt="Roma" />)
    expect(await screen.findByText('pano /p.jpg')).toBeInTheDocument()
    vi.doUnmock('./PanoramaViewer')
  })

  it('parça yüklenemezse düz önizlemeye düşer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const loader = () => Promise.reject(new Error('chunk yok'))
    render(<ViewerSection src="/p.png" alt="Roma" loader={loader} />)
    const img = await screen.findByRole('img', { name: 'Roma' })
    expect(img).toHaveAttribute('src', '/p.png')
    expect(screen.getByText('3B görüntüleyici yüklenemedi, düz önizleme gösteriliyor')).toBeInTheDocument()
    expect(screen.getByText('Roma', { selector: 'figcaption' })).toBeInTheDocument()
  })

  it('gerçek görüntüleyici WebGL yokken (jsdom) düz önizleme gösterir', async () => {
    render(<ViewerSection src="/p.png" alt="Roma" />)
    expect(await screen.findByText('3B görüntüleme desteklenmiyor, düz önizleme gösteriliyor', {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Roma' })).toHaveAttribute('src', '/p.png')
  }, 15000)
})
