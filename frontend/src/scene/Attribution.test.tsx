import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Attribution } from './Attribution'
import type { SceneAttribution } from '../api/scenes'

afterEach(cleanup)

const base: SceneAttribution = { author: null, license: null, licenseUrl: null, sourceUrl: null, provider: 'sample' }

describe('Attribution', () => {
  it('Mapillary: yazar, bağlantılı lisans ve Mapillary bağlantısı', () => {
    render(
      <Attribution
        attribution={{ ...base, provider: 'mapillary', author: 'ayse', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' }}
      />,
    )
    const line = screen.getByText(/^Görsel:/)
    expect(line).toHaveTextContent('Görsel: ayse · CC BY-SA 4.0 · Mapillary')
    const lic = screen.getByRole('link', { name: 'CC BY-SA 4.0' })
    expect(lic).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/')
    expect(lic).toHaveAttribute('target', '_blank')
    expect(lic).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Mapillary' })).toHaveAttribute('href', 'https://www.mapillary.com/')
  })

  it('Commons: kaynak sayfası bağlantı olur', () => {
    render(<Attribution attribution={{ ...base, provider: 'wikimedia-commons', author: 'Ali', license: 'CC0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg' }} />)
    expect(screen.getByText(/^Görsel:/)).toHaveTextContent('Görsel: Ali · CC0 · Wikimedia Commons')
    expect(screen.getByRole('link', { name: 'Wikimedia Commons' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:X.jpg')
    expect(screen.queryByRole('link', { name: 'CC0' })).not.toBeInTheDocument()
  })

  it('sample: yazar yok, "Örnek görsel" düz metin', () => {
    render(<Attribution attribution={base} />)
    expect(screen.getByText(/^Görsel:/)).toHaveTextContent('Görsel: Örnek görsel')
    expect(screen.queryByRole('link', { name: 'Örnek görsel' })).not.toBeInTheDocument()
  })

  it('javascript: URL bağlantı olmaz, metin düz kalır', () => {
    render(<Attribution attribution={{ ...base, provider: 'wikimedia-commons', license: 'CC0', licenseUrl: 'javascript:alert(1)', sourceUrl: 'javascript:alert(2)' }} />)
    expect(screen.queryByRole('link', { name: 'CC0' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Wikimedia Commons' })).not.toBeInTheDocument()
    expect(screen.getByText(/^Görsel:/)).toHaveTextContent('CC0 · Wikimedia Commons')
  })

  it('HTML içeren yazar düz metin olarak basılır', () => {
    const { container } = render(<Attribution attribution={{ ...base, author: '<img src=x onerror=alert(1)>' }} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument()
  })

  it('atıf yoksa Görsel satırı yok, ODbL satırı her zaman var', () => {
    render(<Attribution attribution={null} />)
    expect(screen.queryByText(/^Görsel:/)).not.toBeInTheDocument()
    expect(screen.getByText(/İlçe sınırları/)).toHaveTextContent('İlçe sınırları © OpenStreetMap katkıcıları (ODbL)')
    expect(screen.getByRole('link', { name: 'OpenStreetMap katkıcıları' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })

  it('footer öğesi olarak çizilir', () => {
    const { container } = render(<Attribution attribution={base} />)
    expect(container.querySelector('footer.attribution')).toBeInTheDocument()
  })
})
