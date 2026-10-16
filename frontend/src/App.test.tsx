import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./location/LocationPicker', () => ({
  LocationPicker: ({ onChange }: { onChange: (v: { latitude: number; longitude: number }) => void }) => (
    <div>
      <button onClick={() => onChange({ latitude: 41.9, longitude: 12.5 })}>Roma seç</button>
      <button onClick={() => onChange({ latitude: -33.8688, longitude: 151.2093 })}>Sidney seç</button>
    </div>
  ),
}))

const scene = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 's1',
  status,
  request: { year: 2026, latitude: 41.9, longitude: 12.5 },
  result: null,
  error: null,
  createdAt: '2026-10-15T15:30:00Z',
  ...extra,
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const readyScene = scene('READY', { result: { panoramaUrl: '/api/samples/sample-pano.png', depthUrl: '/api/samples/sample-depth.png' } })

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function pickRome() {
  fireEvent.click(await screen.findByRole('button', { name: 'Roma seç' }))
}
const generate = () => screen.getByRole('button', { name: 'Sahne oluştur' })
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('App', () => {
  it('başlık, özet ve pasif düğmeyi gösterir; konum yokken düğme pasiftir', async () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Time Portal' })).toBeInTheDocument()
    expect(generate()).toBeDisabled()
    await pickRome()
    expect(generate()).toBeEnabled()
    expect(screen.getByText('2026 · 41.9000° K, 12.5000° D')).toBeInTheDocument()
  })

  it('PENDING→RUNNING→READY durumlarını gösterir ve panoramayı önizler', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(scene('PENDING'), 202))
      .mockResolvedValueOnce(json(scene('PENDING')))
      .mockResolvedValueOnce(json(scene('RUNNING')))
      .mockResolvedValueOnce(json(readyScene))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    expect(screen.getByRole('status')).toHaveTextContent('Gönderiliyor…')
    expect(generate()).toBeDisabled()
    await tick(0)
    expect(screen.getByRole('status')).toHaveTextContent('Sırada…')
    await tick(1000)
    expect(screen.getByRole('status')).toHaveTextContent('Üretiliyor…')
    expect(generate()).toBeDisabled()
    await tick(1000)
    expect(screen.getByRole('status')).toHaveTextContent('Sahne hazır')
    expect(generate()).toBeEnabled()

    const img = screen.getByRole('img', { name: 'Üretilen panorama: 2026, 41.9000° K, 12.5000° D' })
    expect(img).toHaveAttribute('src', '/api/samples/sample-pano.png')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ year: 2026, latitude: 41.9, longitude: 12.5 })
  })

  it('seçim sonradan değişse de önizleme kendi isteğinin açıklamasını korur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(readyScene)))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(screen.getByRole('status')).toHaveTextContent('Sahne hazır')
    fireEvent.click(screen.getByRole('button', { name: 'Sidney seç' }))
    expect(screen.getByRole('img', { name: 'Üretilen panorama: 2026, 41.9000° K, 12.5000° D' })).toBeInTheDocument()
    expect(screen.getByText('2026 · 33.8688° G, 151.2093° D')).toBeInTheDocument()
  })

  it('FAILED durumunu mesajıyla gösterir, resim göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockResolvedValueOnce(json(scene('FAILED', { error: 'üretici çöktü' }))),
    )
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(screen.getByRole('status')).toHaveTextContent('Üretim başarısız: üretici çöktü')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(generate()).toBeEnabled()
  })

  it('400 durumunda sunucunun mesajını gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: 'latitude aralık dışı' }, 400)))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(screen.getByRole('status')).toHaveTextContent('latitude aralık dışı')
    expect(generate()).toBeEnabled()
  })

  it('ağ hatasında "Sunucuya ulaşılamadı" gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(screen.getByRole('status')).toHaveTextContent('Sunucuya ulaşılamadı')
  })

  it('yoklama sırasında ağ hatası da "Sunucuya ulaşılamadı" gösterir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(scene('PENDING'), 202)).mockRejectedValue(new TypeError('x')))
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(screen.getByRole('status')).toHaveTextContent('Sunucuya ulaşılamadı')
  })

  it('üretim sürerken düğme pasiftir, ikinci tıklama yeni istek başlatmaz ve yoklama sürer', async () => {
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      if (init?.method === 'POST') return json(scene('PENDING'), 202)
      return json(url.endsWith('/s1') ? scene('RUNNING') : readyScene)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(signals.every((s) => !s.aborted)).toBe(true)
    expect(generate()).toBeDisabled()
    fireEvent.click(generate())
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1)
    expect(signals.every((s) => !s.aborted)).toBe(true)
  })

  it('unmount olunca yoklamayı iptal eder', async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal)
        return init?.method === 'POST' ? json(scene('PENDING'), 202) : json(scene('RUNNING'))
      }),
    )
    const { unmount } = render(<App />)
    await pickRome()
    fireEvent.click(generate())
    await tick(0)
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((s) => !s.aborted)).toBe(true)
    unmount()
    expect(signals.every((s) => s.aborted)).toBe(true)
  })
})
