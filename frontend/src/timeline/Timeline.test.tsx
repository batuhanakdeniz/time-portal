import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('tıklayınca geçerli bir yıl seçilir', () => {
    const { slider, onChange } = setup(2026)
    fireEvent.pointerDown(slider, { clientX: 300, clientY: 10, pointerId: 1, button: 0 })
    fireEvent.pointerUp(slider, { clientX: 300, clientY: 10, pointerId: 1, button: 0 })
    expect(onChange).toHaveBeenCalledTimes(1)
    const year = onChange.mock.calls[0][0]
    expect(Number.isInteger(year)).toBe(true)
    expect(year).not.toBe(0)
  })
})
