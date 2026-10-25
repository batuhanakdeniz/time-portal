import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { counterYear, LoadingScreen, STAGE_STEPS } from './LoadingScreen'
import type { SceneStage } from '../api/scenes'

const STAGE_TEXTS = ['İlçe bulunuyor', 'Görsel aranıyor (360° → fotoğraf)', 'Derinlik hesaplanıyor', 'Sahne kuruluyor']

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

interface Opts {
  stage?: SceneStage | null
  elapsedMs?: number
  targetYear?: number
}

function renderLoading({ stage = null, elapsedMs = 0, targetYear = 1453 }: Opts = {}) {
  const onCancel = vi.fn()
  const view = render(<LoadingScreen stage={stage} elapsedMs={elapsedMs} targetYear={targetYear} onCancel={onCancel} />)
  const root = view.container.querySelector('.loading-screen') as HTMLElement
  const counter = view.container.querySelector('.loading-counter') as HTMLElement
  return { ...view, root, counter, onCancel }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LoadingScreen aşamaları', () => {
  it('aşama metinleri sözleşmedeki sırayla', () => {
    expect(STAGE_STEPS.map((s) => s.label)).toEqual(STAGE_TEXTS)
  })

  it.each([
    ['LOCATING', 0],
    ['IMAGE_SEARCH', 1],
    ['DEPTH', 2],
    ['PACKAGING', 3],
  ] as const)('%s: geçerli aşama işaretlenir ve role="status" içinde duyurulur', (stage, index) => {
    renderLoading({ stage })
    const status = screen.getByRole('status')
    for (const text of STAGE_TEXTS) expect(status).toHaveTextContent(text)
    const current = screen.getByText(STAGE_TEXTS[index])
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(current).toHaveAttribute('data-state', 'current')
    if (index > 0) expect(screen.getByText(STAGE_TEXTS[index - 1])).toHaveAttribute('data-state', 'done')
    if (index < 3) expect(screen.getByText(STAGE_TEXTS[index + 1])).toHaveAttribute('data-state', 'todo')
  })

  it('stage null ise sahte aşama gösterilmez, yalnızca geçen süre', () => {
    renderLoading({ stage: null, elapsedMs: 7400 })
    for (const text of STAGE_TEXTS) expect(screen.queryByText(text)).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText('7 sn · genelde 10–35 sn')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Zamanda yolculuk sürüyor…')
  })

  it('aşama değişince yeni aşama işaretlenir', () => {
    const { rerender } = renderLoading({ stage: 'LOCATING' })
    rerender(<LoadingScreen stage="DEPTH" elapsedMs={9000} targetYear={1453} onCancel={() => {}} />)
    expect(screen.getByText('Derinlik hesaplanıyor')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('İlçe bulunuyor')).toHaveAttribute('data-state', 'done')
  })
})

describe('LoadingScreen süre', () => {
  it('"12 sn · genelde 10–35 sn"', () => {
    renderLoading({ elapsedMs: 12_000 })
    expect(screen.getByText('12 sn · genelde 10–35 sn')).toBeInTheDocument()
  })

  it('35 sn’ye kadar uyarı yok, sonra "Beklenenden uzun sürüyor"', () => {
    const { rerender } = renderLoading({ stage: 'DEPTH', elapsedMs: 35_000 })
    expect(screen.queryByText('Beklenenden uzun sürüyor')).toBeNull()
    rerender(<LoadingScreen stage="DEPTH" elapsedMs={36_000} targetYear={1453} onCancel={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Beklenenden uzun sürüyor')
    expect(screen.getByText('36 sn · genelde 10–35 sn')).toBeInTheDocument()
  })

  it('geçersiz süre 0 sayılır', () => {
    renderLoading({ elapsedMs: Number.NaN })
    expect(screen.getByText('0 sn · genelde 10–35 sn')).toBeInTheDocument()
  })

  it('Vazgeç onCancel çağırır', () => {
    const { onCancel } = renderLoading()
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('LoadingScreen hareket', () => {
  it('sayaç 2026’dan hedef yıla 1,5 sn’de akar, sonra sabit kalır', () => {
    const { counter } = renderLoading({ targetYear: 1453 })
    expect(counter).toHaveTextContent('2026')
    act(() => {
      vi.advanceTimersByTime(500)
    })
    const mid = Number(counter.textContent)
    expect(mid).toBeLessThan(2026)
    expect(mid).toBeGreaterThan(1453)
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(counter).toHaveTextContent('1453')
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(counter).toHaveTextContent('1453')
  })

  it('MÖ hedefte sayaç MÖ biçimiyle biter ve yıl 0 atlanır', () => {
    const { counter } = renderLoading({ targetYear: -1200 })
    act(() => {
      vi.advanceTimersByTime(1600)
    })
    expect(counter).toHaveTextContent('MÖ 1200')
    expect(screen.getByText('2026 → MÖ 1200')).toBeInTheDocument()
    for (let t = 0; t <= 1; t += 0.001) expect(counterYear(2026, -1200, t)).not.toBe(0)
  })

  it('counterYear uçları ve ease-out', () => {
    expect(counterYear(2026, 1453, 0)).toBe(2026)
    expect(counterYear(2026, 1453, 1)).toBe(1453)
    expect(counterYear(2026, 1453, 2)).toBe(1453)
    // ease-out: yolun yarısından fazlası ilk yarıda alınır
    expect(2026 - counterYear(2026, 1453, 0.5)).toBeGreaterThan((2026 - 1453) / 2)
  })

  it('5 sn sonra halkalar durgun "nefes" moduna geçer', () => {
    const { root } = renderLoading()
    expect(root).toHaveAttribute('data-motion', 'active')
    expect(root.querySelectorAll('.loading-ring')).toHaveLength(4)
    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(root).toHaveAttribute('data-motion', 'active')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(root).toHaveAttribute('data-motion', 'calm')
  })

  it('sayfa zaten 5 sn’yi geçmişse hemen durgun', () => {
    const { root } = renderLoading({ elapsedMs: 8000 })
    expect(root).toHaveAttribute('data-motion', 'calm')
  })

  it('reduced motion’da tamamen statik: sayaç hedefte başlar', () => {
    mockReducedMotion(true)
    const { root, counter } = renderLoading({ targetYear: 1453 })
    expect(root).toHaveAttribute('data-motion', 'reduced')
    expect(counter).toHaveTextContent('1453')
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(root).toHaveAttribute('data-motion', 'reduced')
  })

  it('reduced motion kapalıysa animasyonlu başlar', () => {
    mockReducedMotion(false)
    const { root, counter } = renderLoading({ targetYear: 1453 })
    expect(root).toHaveAttribute('data-motion', 'active')
    expect(counter).toHaveTextContent('2026')
  })
})
