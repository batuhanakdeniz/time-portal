import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScenePreview } from './ScenePreview'

afterEach(cleanup)

describe('ScenePreview', () => {
  it('yüklenirken bilgi gösterir, yüklenince kaldırır', () => {
    render(<ScenePreview src="/a.png" caption="Başlık" />)
    expect(screen.getByText('Panorama yükleniyor…')).toBeInTheDocument()
    fireEvent.load(screen.getByRole('img', { name: 'Başlık' }))
    expect(screen.queryByText('Panorama yükleniyor…')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Başlık' })).toHaveAttribute('src', '/a.png')
  })

  it('resim yüklenemezse hata mesajı gösterir, kırık resim bırakmaz', () => {
    render(<ScenePreview src="/yok.png" caption="Başlık" />)
    fireEvent.error(screen.getByRole('img', { name: 'Başlık' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Panorama yüklenemedi')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('src değişince durum sıfırlanır', () => {
    const { rerender } = render(<ScenePreview src="/yok.png" caption="Başlık" />)
    fireEvent.error(screen.getByRole('img'))
    rerender(<ScenePreview src="/b.png" caption="Başlık" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/b.png')
    expect(screen.getByText('Panorama yükleniyor…')).toBeInTheDocument()
  })
})
