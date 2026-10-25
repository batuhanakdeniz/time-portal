import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaceSearch, foldTr, searchPlaces } from './PlaceSearch'
import { DISTRICTS_URL, PROVINCES_URL, indexPlaces, resetPlacesCache } from './places'
import type { PlaceSelection } from './place'

const read = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))
const files: Record<string, unknown> = {
  [PROVINCES_URL]: read('../../public/geo/provinces.json'),
  [DISTRICTS_URL]: read('../../public/geo/districts.json'),
}
const data = indexPlaces(files[PROVINCES_URL] as never, files[DISTRICTS_URL] as never)

beforeEach(() => {
  resetPlacesCache()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => files[url] }) as Response))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('foldTr', () => {
  it('Türkçe büyük/küçük harf ve aksan duyarsız', () => {
    expect(foldTr('İSTANBUL')).toBe('istanbul')
    expect(foldTr('Istanbul')).toBe('istanbul')
    expect(foldTr('IĞDIR')).toBe('igdir')
    expect(foldTr('Şanlıurfa')).toBe('sanliurfa')
    expect(foldTr('Hakkâri')).toBe('hakkari')
    expect(foldTr('  Beyoğlu, İstanbul ')).toBe('beyoglu istanbul')
  })
})

describe('searchPlaces', () => {
  it('boş sorgu 81 ili alfabetik listeler', () => {
    const r = searchPlaces(data, '')
    expect(r).toHaveLength(81)
    expect(r.every((o) => o.kind === 'province')).toBe(true)
    expect(r[0].label).toBe('Adana')
    expect(r.at(-1)!.label).toBe('Zonguldak')
  })

  it('aksansız yazım eşleşir; önce iller, sonra ilçeler', () => {
    const r = searchPlaces(data, 'istanbul')
    expect(r[0]).toMatchObject({ kind: 'province', label: 'İstanbul', id: '34' })
    // il adıyla birebir eşleşme o ilin 39 ilçesini de getirir
    expect(r.filter((o) => o.kind === 'district' && o.detail === 'İstanbul')).toHaveLength(39)
  })

  it('ilçe araması il bilgisiyle', () => {
    const r = searchPlaces(data, 'beyog')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'district', label: 'Beyoğlu', detail: 'İstanbul', id: '34-beyoglu' })
    expect(r[0].selection.center).toEqual({ lat: r[0].selection.district!.lat, lon: r[0].selection.district!.lon })
  })

  it('plaka koduyla il bulunur', () => {
    expect(searchPlaces(data, '6')[0]).toMatchObject({ kind: 'province', label: 'Ankara' })
    expect(searchPlaces(data, '34')[0]).toMatchObject({ label: 'İstanbul' })
  })

  it('başlangıç eşleşmesi içerme eşleşmesinden önce', () => {
    const labels = searchPlaces(data, 'kar').filter((o) => o.kind === 'province').map((o) => o.label)
    expect(labels.indexOf('Karabük')).toBeLessThan(labels.indexOf('Afyonkarahisar'))
  })

  it('sonuç sayısı sınırlı', () => {
    expect(searchPlaces(data, 'a').length).toBeLessThanOrEqual(60)
  })
})

async function renderSearch(selected: PlaceSelection | null = null, onSelect = vi.fn()) {
  const utils = render(<PlaceSearch selected={selected} onSelect={onSelect} />)
  const input = screen.getByRole('combobox', { name: 'İl ya da ilçe ara' })
  await waitFor(() => expect(input).toBeEnabled())
  return { ...utils, input, onSelect }
}

describe('PlaceSearch', () => {
  it('combobox ARIA öznitelikleri', async () => {
    const { input } = await renderSearch()
    const list = screen.getByRole('listbox', { hidden: true })
    expect(input).toHaveAttribute('aria-controls', list.id)
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
  })

  it('yazınca liste açılır; klavyeyle gezinip Enter ile seçer', async () => {
    const { input, onSelect } = await renderSearch()
    fireEvent.change(input, { target: { value: 'İSTANBUL' } })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options[0]).toHaveTextContent('İstanbul')
    expect(input).not.toHaveAttribute('aria-activedescendant')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith({ plate: '34', province: 'İstanbul', center: { lat: 41.01, lon: 28.96028 } })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveValue('İstanbul')
  })

  it('ArrowUp ilk konumdan sona sarar', async () => {
    const { input } = await renderSearch()
    fireEvent.change(input, { target: { value: 'beyog' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    const options = screen.getAllByRole('option')
    expect(input).toHaveAttribute('aria-activedescendant', options.at(-1)!.id)
  })

  it('kapalıyken ArrowDown 81 ili listeler (liste görünümü)', async () => {
    const { input } = await renderSearch()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')).toHaveLength(81)
  })

  it('Escape listeyi kapatır, ikinci Escape metni temizler', async () => {
    const { input } = await renderSearch()
    fireEvent.change(input, { target: { value: 'ank' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveValue('ank')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('')
  })

  it('fareyle ilçe seçimi ilçe merkeziyle', async () => {
    const { input, onSelect } = await renderSearch()
    fireEvent.change(input, { target: { value: 'kadıköy' } })
    fireEvent.click(screen.getByRole('option', { name: /Kadıköy/ }))
    const sel = onSelect.mock.calls[0][0] as PlaceSelection
    expect(sel).toMatchObject({ plate: '34', province: 'İstanbul', district: { slug: 'kadikoy', name: 'Kadıköy' } })
    expect(sel.center).toEqual({ lat: sel.district!.lat, lon: sel.district!.lon })
  })

  it('sonuç yoksa bildirir', async () => {
    const { input } = await renderSearch()
    fireEvent.change(input, { target: { value: 'qqq' } })
    expect(screen.getByText('Sonuç yok')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('aria-live: "İstanbul seçildi, 39 ilçe"; ilçe seçiminde "Beyoğlu, İstanbul seçildi"', async () => {
    const ist: PlaceSelection = { plate: '34', province: 'İstanbul', center: { lat: 41.01, lon: 28.96028 } }
    const { container, rerender, input } = await renderSearch()
    const live = container.querySelector('[aria-live="polite"]')!
    expect(live).toHaveTextContent('')
    rerender(<PlaceSearch selected={ist} onSelect={vi.fn()} />)
    expect(live).toHaveTextContent('İstanbul seçildi, 39 ilçe')
    // dışarıdan (haritadan) gelen seçim kutuya da yansır
    expect(input).toHaveValue('İstanbul')
    const beyoglu = searchPlaces(data, 'beyoglu')[0].selection
    rerender(<PlaceSearch selected={beyoglu} onSelect={vi.fn()} />)
    expect(live).toHaveTextContent('Beyoğlu, İstanbul seçildi')
    expect(input).toHaveValue('Beyoğlu, İstanbul')
  })

  it('seçim varken listeyi açmak o ili ve ilçelerini gösterir', async () => {
    const ist: PlaceSelection = { plate: '34', province: 'İstanbul', center: { lat: 41.01, lon: 28.96028 } }
    const { input } = await renderSearch(ist)
    fireEvent.click(input)
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('İstanbul')
    expect(options).toHaveLength(40)
  })

  it('veri yüklenemezse kutu devre dışı ve açıklamalı', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response))
    render(<PlaceSearch selected={null} onSelect={vi.fn()} />)
    const input = screen.getByRole('combobox')
    expect(input).toBeDisabled()
    await waitFor(() => expect(input).toHaveAttribute('placeholder', 'Yer listesi yüklenemedi'))
    await act(async () => {})
  })
})
