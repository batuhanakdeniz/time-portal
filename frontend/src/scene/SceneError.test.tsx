import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SceneError, sceneErrorText, type SceneErrorKind } from './SceneError'

afterEach(cleanup)

function setup(kind: SceneErrorKind, retryAfterSec?: number) {
  const onRetry = vi.fn()
  const onBack = vi.fn()
  render(<SceneError kind={kind} retryAfterSec={retryAfterSec} onRetry={onRetry} onBack={onBack} />)
  return { onRetry, onBack }
}

describe('SceneError', () => {
  it('görsel yok: başlık, açıklama, Haritaya dön ve Tekrar dene', () => {
    const { onRetry, onBack } = setup('no-image')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Bu ilçe için görsel bulunamadı')
    expect(alert).toHaveTextContent('Açık lisanslı fotoğraf ya da 360° görüntü yok.')
    fireEvent.click(screen.getByRole('button', { name: 'Haritaya dön' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('dönem sahnesi yok: tekrar deneme önerilmez', () => {
    setup('no-period')
    expect(screen.getByRole('alert')).toHaveTextContent('Bu dönem için sahne henüz yok.')
    expect(screen.queryByRole('button', { name: 'Tekrar dene' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Haritaya dön' })).toBeInTheDocument()
  })

  it('ağ yok', () => {
    setup('network')
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı')
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })

  it('sunucu meşgul: geri sayım metni props’tan gelir', () => {
    setup('busy', 12)
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucu meşgul, 12 sn sonra yeniden denenecek')
  })

  it('sunucu meşgul: kesirli süre yukarı yuvarlanır, süre yoksa geri sayım yok', () => {
    expect(sceneErrorText('busy', 4.2).title).toBe('Sunucu meşgul, 5 sn sonra yeniden denenecek')
    expect(sceneErrorText('busy').title).toBe('Sunucu meşgul')
    expect(sceneErrorText('busy', 0).title).toBe('Sunucu meşgul')
    expect(sceneErrorText('busy', Number.NaN).title).toBe('Sunucu meşgul')
  })

  it('zaman aşımı ve bilinmeyen hata', () => {
    expect(sceneErrorText('timeout').title).toBe('Üretim çok uzun sürdü')
    expect(sceneErrorText('unknown').title).toBe('Sahne üretilemedi')
  })

  it('her türde Türkçe metin ve geri dönüş düğmesi vardır', () => {
    const kinds: SceneErrorKind[] = ['no-image', 'no-period', 'network', 'busy', 'timeout', 'unknown']
    for (const kind of kinds) {
      const { unmount } = render(<SceneError kind={kind} onRetry={() => {}} onBack={() => {}} />)
      expect(screen.getByRole('alert').textContent?.trim()).not.toBe('')
      expect(screen.getByRole('button', { name: 'Haritaya dön' })).toBeInTheDocument()
      unmount()
    }
  })
})
