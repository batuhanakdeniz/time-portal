import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { positionToYear } from './scale'
import { Timeline } from './Timeline'

afterEach(cleanup)

function setup(value: number) {
  const onChange = vi.fn()
  render(<Timeline value={value} onChange={onChange} />)
  return { onChange, slider: screen.getByRole('slider') }
}

describe('Timeline', () => {
  it('slider rolü ve aria değerlerini gösterir', () => {
    const { slider } = setup(-44)
    expect(slider).toHaveAttribute('aria-valuemin', '-100000')
    expect(slider).toHaveAttribute('aria-valuemax', '100000')
    expect(slider).toHaveAttribute('aria-valuenow', '-44')
    expect(slider).toHaveAttribute('aria-valuetext', 'MÖ 44')
  })

  it('seçili yılı ve eksen etiketlerini biçimlendirilmiş gösterir', () => {
    setup(1453)
    expect(screen.getByTestId('timeline-selected')).toHaveTextContent('1453')
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '1453')
    expect(screen.getAllByTestId('timeline-tick').length).toBeGreaterThan(2)
  })

  it('→ ve ← küçük adımla onChange çağırır', () => {
    const { slider, onChange } = setup(2026)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(2027)
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(2025)
  })

  it('Shift+ok büyük adım atar', () => {
    const { slider, onChange } = setup(2026)
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(2036)
  })

  it('yıl 0 hiç üretilmez', () => {
    const a = setup(1)
    fireEvent.keyDown(a.slider, { key: 'ArrowLeft' })
    expect(a.onChange).toHaveBeenLastCalledWith(-1)
  })

  it('Home/End sınırlara gider', () => {
    const { slider, onChange } = setup(2026)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(-100000)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith(100000)
  })

  it('tıklayınca tıklanan konumun yılı seçilir', () => {
    const { slider, onChange } = setup(2026)
    fireEvent.pointerDown(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse', button: 0 })
    fireEvent.pointerUp(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse', button: 0 })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(positionToYear(0.5))
  })

  it('eşik üstü sürüklemeden sonra yıl seçilmez, görünüm kayar', () => {
    const { slider, onChange } = setup(2026)
    // Önce yakınlaştır ki kaydırma mümkün olsun
    fireEvent.keyDown(slider, { key: '+' })
    const before = Number(slider.dataset.viewStart)
    fireEvent.pointerDown(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(slider, { clientX: 340, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(slider, { clientX: 340, pointerId: 1, pointerType: 'mouse', button: 0 })
    expect(onChange).not.toHaveBeenCalled()
    expect(Number(slider.dataset.viewStart)).not.toBe(before)
  })

  it('pinch sırasında ve sonrasında tıklama sayılmaz', () => {
    const { slider, onChange } = setup(2026)
    fireEvent.pointerDown(slider, { clientX: 250, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerDown(slider, { clientX: 350, pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerMove(slider, { clientX: 450, pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerUp(slider, { clientX: 450, pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerUp(slider, { clientX: 250, pointerId: 1, pointerType: 'touch' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('fare sağ tık yıl seçmez', () => {
    const { slider, onChange } = setup(2026)
    fireEvent.pointerDown(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse', button: 2 })
    fireEvent.pointerUp(slider, { clientX: 300, pointerId: 1, pointerType: 'mouse', button: 2 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('tekerlek görünümü değiştirir ve varsayılanı engeller', () => {
    const { slider } = setup(2026)
    const spanBefore = Number(slider.dataset.viewEnd) - Number(slider.dataset.viewStart)
    const notPrevented = fireEvent.wheel(slider, { deltaY: -200, clientX: 300 })
    expect(notPrevented).toBe(false)
    const spanAfter = Number(slider.dataset.viewEnd) - Number(slider.dataset.viewStart)
    expect(spanAfter).toBeLessThan(spanBefore)
  })

  it('Shift+← ve ← yıl 0\'ı atlar', () => {
    const a = setup(5)
    fireEvent.keyDown(a.slider, { key: 'ArrowLeft', shiftKey: true })
    expect(a.onChange).toHaveBeenLastCalledWith(-6)
    cleanup()
    const b = setup(1)
    fireEvent.keyDown(b.slider, { key: 'ArrowLeft' })
    expect(b.onChange).toHaveBeenLastCalledWith(-1)
  })

  it('geçersiz value ağacı çökertmez', () => {
    for (const bad of [0, 1.5, NaN]) {
      const { slider } = setup(bad)
      expect(slider).not.toHaveAttribute('aria-valuenow')
      expect(screen.getByTestId('timeline-selected')).toHaveTextContent('—')
      cleanup()
    }
  })

  it('PageUp/PageDown pencereye orantılı büyük adım atar', () => {
    const { slider, onChange } = setup(2026)
    fireEvent.keyDown(slider, { key: 'PageUp' })
    expect(onChange).toHaveBeenLastCalledWith(22026) // pencere 200000 yıl, %10
    fireEvent.keyDown(slider, { key: 'PageDown' })
    expect(onChange).toHaveBeenLastCalledWith(-17975) // 0. yıl atlanır
  })

  it('+ ve - yakınlaştırır / uzaklaştırır', () => {
    const { slider } = setup(2026)
    const width = () => Number(slider.dataset.viewEnd) - Number(slider.dataset.viewStart)
    fireEvent.keyDown(slider, { key: '+' })
    const zoomed = width()
    expect(zoomed).toBeLessThan(1)
    fireEvent.keyDown(slider, { key: '-' })
    expect(width()).toBeGreaterThan(zoomed)
  })
})
