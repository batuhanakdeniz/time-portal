import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_YEAR, MIN_YEAR } from '../lib/year'
import { HoyukYearPicker, SCROLL_IDLE_MS, sliderValueText } from './HoyukYearPicker'
import { yearToOffset } from './hoyukGeometry'
import { PERIODS } from './periods'
import { SILHOUETTE_IDS } from './silhouettes'

/** Üst bileşen gibi değeri tutan (kontrollü) sarmalayıcı; çağrılar casuslara da gider. */
function Controlled({
  initial,
  onChange,
  onConfirm,
}: {
  initial: number
  onChange: (y: number) => void
  onConfirm: () => void
}) {
  const [year, setYear] = useState(initial)
  return (
    <HoyukYearPicker
      value={year}
      onChange={(y) => {
        onChange(y)
        setYear(y)
      }}
      onConfirm={onConfirm}
    />
  )
}

function setup(value = 1453) {
  const onChange = vi.fn()
  const onConfirm = vi.fn()
  const utils = render(<Controlled initial={value} onChange={onChange} onConfirm={onConfirm} />)
  const slider = screen.getByRole('slider')
  return { ...utils, onChange, onConfirm, slider }
}

function mockReducedMotion(matches: boolean) {
  const mq = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq),
  )
  return mq
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('slider ARIA', () => {
  it('role, değer aralığı ve metin', () => {
    const { slider } = setup(1453)
    expect(slider).toHaveAttribute('aria-valuemin', String(MIN_YEAR))
    expect(slider).toHaveAttribute('aria-valuemax', String(MAX_YEAR))
    expect(slider).toHaveAttribute('aria-valuenow', '1453')
    expect(slider).toHaveAttribute('aria-valuetext', '1453, Osmanlı klasik')
    expect(slider).toHaveAttribute('aria-orientation', 'vertical')
    expect(slider).toHaveAttribute('tabindex', '0')
  })
  it('MÖ ve kurgu dönem metni', () => {
    expect(sliderValueText(-1200)).toBe('MÖ 1200, Demir Çağı')
    expect(sliderValueText(-50000)).toBe('MÖ 50.000, Paleolitik ve buzul çağı, sahne henüz yok')
  })
  it('geçersiz değerde bugüne düşer', () => {
    const { slider } = setup(0)
    expect(slider).toHaveAttribute('aria-valuenow', '2026')
  })
})

describe('klavye', () => {
  it('↑/↓ ±1, Shift ±10, ←/→ de çalışır', () => {
    const { slider, onChange } = setup(1453)
    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith(1454)
    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(1453)
    fireEvent.keyDown(slider, { key: 'ArrowDown', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(1443)
    fireEvent.keyDown(slider, { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(1454)
  })
  it('0 yılını atlar', () => {
    const { slider, onChange } = setup(1)
    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(-1)
  })
  it('PgUp/PgDn dönem sınırına, Home/End uçlara', () => {
    const { slider, onChange } = setup(1500)
    fireEvent.keyDown(slider, { key: 'PageUp' })
    expect(onChange).toHaveBeenLastCalledWith(1700)
    fireEvent.keyDown(slider, { key: 'PageDown' })
    expect(onChange).toHaveBeenLastCalledWith(1453)
    fireEvent.keyDown(slider, { key: 'PageDown' })
    expect(onChange).toHaveBeenLastCalledWith(1071)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(MIN_YEAR)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith(MAX_YEAR)
  })
  it('Enter onaylar; bilinmeyen tuş bir şey yapmaz', () => {
    const { slider, onChange, onConfirm } = setup(1453)
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(slider, { key: 'a' })
    expect(onChange).not.toHaveBeenCalled()
  })
  it('kontrollü kullanımda ARIA değeri güncellenir', () => {
    const { slider } = setup(1923)
    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    expect(slider).toHaveAttribute('aria-valuenow', '1924')
    expect(slider).toHaveAttribute('aria-valuetext', '1924, Erken Cumhuriyet')
    expect(screen.getByTestId('hoyuk-summary-year')).toHaveTextContent('1924')
  })
})

describe('kısayollar ve onay', () => {
  it('kısayollar onChange çağırır', () => {
    const { onChange } = setup(2026)
    const expected: [RegExp, number][] = [
      [/Göbeklitepe · MÖ 9600/, -9600],
      [/Truva · MÖ 1200/, -1200],
      [/Fetih · 1453/, 1453],
      [/Cumhuriyet · 1923/, 1923],
    ]
    for (const [name, year] of expected) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(onChange).toHaveBeenLastCalledWith(year)
    }
  })
  it('seçili kısayol basılı görünür', () => {
    setup(1453)
    expect(screen.getByRole('button', { name: /Fetih/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Truva/ })).toHaveAttribute('aria-pressed', 'false')
  })
  it('"Bu yıla git" onConfirm çağırır', () => {
    const { onConfirm } = setup(1453)
    fireEvent.click(screen.getByRole('button', { name: /Bu yıla git/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('yıl yazma', () => {
  const input = () => screen.getByRole('textbox', { name: 'Yıl yaz' })

  it('inputmode numeric ve MÖ/MS anahtarı', () => {
    setup(-1200)
    expect(input()).toHaveAttribute('inputmode', 'numeric')
    expect(input()).toHaveValue('1200')
    expect(screen.getByRole('button', { name: 'MÖ' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('yazılan yıla gider; anahtar çağı belirler', () => {
    const { onChange } = setup(1453)
    fireEvent.change(input(), { target: { value: 'MÖ 1200' } })
    fireEvent.submit(input())
    expect(onChange).toHaveBeenLastCalledWith(-1200)
    fireEvent.click(screen.getByRole('button', { name: 'MÖ' }))
    fireEvent.change(input(), { target: { value: '9600' } })
    fireEvent.submit(input())
    expect(onChange).toHaveBeenLastCalledWith(-9600)
  })
  it('0 ve aralık dışı mesaj gösterir, onChange çağırmaz', () => {
    const { onChange } = setup(1453)
    fireEvent.change(input(), { target: { value: '0' } })
    fireEvent.submit(input())
    expect(screen.getByRole('alert')).toHaveTextContent('0 yılı yok: MÖ 1 ya da MS 1')
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(input(), { target: { value: '200000' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.submit(input())
    expect(screen.getByRole('alert')).toHaveTextContent('MÖ 100.000 ile 100.000')
    expect(onChange).not.toHaveBeenCalled()
  })
  it('odaklanınca metin tümüyle seçilir; yazmak eskiyi değiştirir', () => {
    setup(-9600)
    const el = input() as HTMLInputElement
    fireEvent.focus(el)
    expect(el.selectionStart).toBe(0)
    expect(el.selectionEnd).toBe(el.value.length)
    expect(el.value).toBe('9600')
  })
  it('"Yıl yaz" düğmesi alanı odaklar ve metni seçer', () => {
    setup(-9600)
    fireEvent.click(screen.getByRole('button', { name: 'Yıl yaz' }))
    const el = input() as HTMLInputElement
    expect(el).toHaveFocus()
    expect(el.selectionStart).toBe(0)
    expect(el.selectionEnd).toBe(4)
  })
  it('boş alanda Enter hiçbir şey yapmaz', () => {
    const { onChange, onConfirm } = setup(1453)
    fireEvent.change(input(), { target: { value: '   ' } })
    fireEvent.submit(input())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input()).not.toHaveAttribute('aria-invalid')
    expect(onChange).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
  it('seçili yılda Enter onaylar', () => {
    const { onConfirm, onChange } = setup(1453)
    fireEvent.change(input(), { target: { value: '1453' } })
    fireEvent.submit(input())
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('kaydırma → yıl', () => {
  it('kaydırma durunca (≤120 ms) okuma çizgisindeki yuvarlanmış yılı bildirir', () => {
    vi.useFakeTimers()
    const { slider, onChange } = setup(2026)
    slider.scrollTop = yearToOffset(-50123)
    fireEvent.scroll(slider)
    expect(onChange).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(SCROLL_IDLE_MS + 5)
    })
    expect(SCROLL_IDLE_MS).toBeLessThanOrEqual(120)
    expect(onChange).toHaveBeenCalledTimes(1)
    const y = onChange.mock.calls[0][0] as number
    expect(Math.abs(y % 100)).toBe(0)
    expect(y).toBeLessThan(-49000)
    expect(y).toBeGreaterThan(-51000)
  })
  it('hap kare başına DOM ile güncellenir (React render olmadan)', () => {
    vi.useFakeTimers()
    const { slider } = setup(2026)
    slider.scrollTop = yearToOffset(1453)
    fireEvent.scroll(slider)
    act(() => {
      vi.advanceTimersByTime(40)
    })
    expect(screen.getByTestId('hoyuk-pill')).toHaveTextContent('1453')
    // aria değeri kaydırma bitene kadar değişmez
    expect(slider).toHaveAttribute('aria-valuenow', '2026')
  })
  it('kesin yazılmış yıl kaydırma olmadan yuvarlanmaz', () => {
    vi.useFakeTimers()
    const { slider, onChange } = setup(2026)
    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith(2027)
    fireEvent.scroll(slider)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('katmanlar ve siluetler', () => {
  it('15 katman, her birinin silueti; kurgu dönemler işaretli', () => {
    const { container } = setup()
    const layers = container.querySelectorAll('[data-period]')
    expect(layers).toHaveLength(15)
    expect(SILHOUETTE_IDS.sort()).toEqual(PERIODS.map((p) => p.id).sort())
    for (const p of PERIODS) {
      expect(container.querySelector(`[data-silhouette="${p.id}"]`)).not.toBeNull()
    }
    const kurgu = [...container.querySelectorAll('.hoyuk-layer--kurgu')].map((l) => l.getAttribute('data-period'))
    expect(kurgu.sort()).toEqual(['neolitik', 'paleolitik', 'uzak-gelecek', 'yakin-gelecek'])
    expect(screen.getAllByText('Sahne henüz yok')).toHaveLength(4)
  })
  it('kurgu dönemde panel notu', () => {
    setup(-50000)
    expect(screen.getByTestId('hoyuk-note')).toHaveTextContent('Bu dönem için sahne henüz yok.')
  })
  it('"1 ekran ≈ N yıl" etiketi', () => {
    setup(2026)
    expect(screen.getByTestId('hoyuk-scale').textContent).toMatch(/^1 ekran ≈ [\d.]+ yıl$/)
  })
})

describe('hareket', () => {
  it('normalde giriş animasyonu oynar, ilk girdiyle atlanır', () => {
    mockReducedMotion(false)
    const { container, slider } = setup()
    const root = container.querySelector('.hoyuk')!
    expect(root).toHaveAttribute('data-intro', 'play')
    expect(root).toHaveAttribute('data-reduced-motion', 'false')
    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    expect(root).toHaveAttribute('data-intro', 'done')
  })
  it('giriş en geç 1,2 sn sonra biter', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    const { container } = setup()
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(container.querySelector('.hoyuk')).toHaveAttribute('data-intro', 'done')
  })
  it('prefers-reduced-motion: giriş yok, atlama anında', () => {
    vi.useFakeTimers()
    mockReducedMotion(true)
    const { container, slider, onChange } = setup(2026)
    const root = container.querySelector('.hoyuk')!
    expect(root).toHaveAttribute('data-intro', 'done')
    expect(root).toHaveAttribute('data-reduced-motion', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Truva/ }))
    expect(onChange).toHaveBeenLastCalledWith(-1200)
    // Animasyon karesi beklemeden hedefte.
    expect(slider.scrollTop).toBeCloseTo(yearToOffset(-1200), 0)
  })
  it('normal harekette atlama zamanla hedefe varır', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    const { slider } = setup(2026)
    fireEvent.click(screen.getByRole('button', { name: /Truva/ }))
    expect(slider.scrollTop).toBeCloseTo(yearToOffset(2026), 0)
    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(slider.scrollTop).toBeCloseTo(yearToOffset(-1200), 0)
  })
})
