import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { placeToSlug, type PlaceSelection } from './place'
import { districtSelection, provinceSelection, usePlaces, type PlacesData } from './places'
import './PlaceSearch.css'

interface Props {
  selected: PlaceSelection | null
  onSelect(p: PlaceSelection): void
}

export interface PlaceOption {
  id: string // "34" | "34-beyoglu"
  kind: 'province' | 'district'
  label: string
  detail: string
  selection: PlaceSelection
}

const MAX_RESULTS = 60

const TR_FOLD: Record<string, string> = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c' }

/** Türkçe büyük/küçük harf + aksan duyarsız karşılaştırma anahtarı: `İSTANBUL`, `istanbul`, `Istanbul` → `istanbul`. */
export function foldTr(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[ğüşıöç]/g, (c) => TR_FOLD[c])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function placeLabel(p: PlaceSelection): string {
  return p.district ? `${p.district.name}, ${p.province}` : p.province
}

/** Ekran okuyucu duyurusu: "İstanbul seçildi, 39 ilçe" ya da "Beyoğlu, İstanbul seçildi". */
export function announcement(p: PlaceSelection, data: PlacesData | null): string {
  if (p.district) return `${placeLabel(p)} seçildi`
  const n = data?.districtsByPlate.get(p.plate)?.length
  return n ? `${p.province} seçildi, ${n} ilçe` : `${p.province} seçildi`
}

/**
 * Boş sorgu: 81 il (liste görünümü). Aksi hâlde önce adı sorguyla başlayan, sonra içeren iller (plaka da eşleşir),
 * ardından ilçeler; sorgu bir ilin adıyla birebir aynıysa o ilin bütün ilçeleri de listelenir.
 */
export function searchPlaces(data: PlacesData, query: string): PlaceOption[] {
  const q = foldTr(query)
  const provinces = [...data.provinceByPlate.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  const provinceOpt = (p: (typeof provinces)[number]): PlaceOption => ({
    id: p.plate, kind: 'province', label: p.name, detail: `İl · ${p.plate}`, selection: provinceSelection(p),
  })
  if (!q) return provinces.map(provinceOpt)

  const rank = (name: string) => {
    const f = foldTr(name)
    return f.startsWith(q) ? 0 : f.includes(q) ? 1 : -1
  }
  const out: PlaceOption[] = []
  const matchedProvinces = provinces
    .map((p) => ({ p, r: p.plate === q.padStart(2, '0') && /^\d+$/.test(q) ? 0 : rank(p.name) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r)
  for (const { p } of matchedProvinces) out.push(provinceOpt(p))

  const exactProvince = provinces.find((p) => foldTr(p.name) === q)
  const districts: { r: number; opt: PlaceOption }[] = []
  for (const p of provinces) {
    for (const d of data.districtsByPlate.get(p.plate) ?? []) {
      const r = exactProvince?.plate === d.plate ? 0 : rank(d.name)
      if (r < 0) continue
      districts.push({
        r,
        opt: { id: d.key, kind: 'district', label: d.name, detail: d.province, selection: districtSelection(d) },
      })
    }
  }
  districts.sort((a, b) => a.r - b.r) // kararlı sıralama: il adı, sonra ilçe adı sırası korunur
  for (const { opt } of districts) out.push(opt)
  return out.slice(0, MAX_RESULTS)
}

export function PlaceSearch({ selected, onSelect }: Props) {
  const { state } = usePlaces()
  const data = state.data
  const baseId = useId()
  const listId = `${baseId}-list`
  const inputId = `${baseId}-input`
  const [text, setText] = useState(selected ? placeLabel(selected) : '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)

  // Seçim dışarıdan (haritadan) değişince kutudaki metin de güncellenir
  const selectedSlug = selected ? placeToSlug(selected) : ''
  const selectedLabel = selected ? placeLabel(selected) : ''
  useEffect(() => {
    setText(selectedLabel)
  }, [selectedSlug, selectedLabel])

  // Kutuda seçimin adı duruyorsa ilin kendisini ve ilçelerini göster (ilçe seçmek için kısa yol)
  const query = selected && text === selectedLabel ? selected.province : text
  const options = useMemo(() => (data && open ? searchPlaces(data, query) : []), [data, open, query])

  useEffect(() => {
    if (active < 0) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  function choose(opt: PlaceOption) {
    onSelect(opt.selection)
    setText(placeLabel(opt.selection))
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(e.key === 'ArrowDown' ? 0 : -1)
        return
      }
      const n = options.length
      if (n === 0) return
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : i <= 0 ? n - 1 : i - 1))
    } else if (e.key === 'Enter') {
      // Etkin seçenek yoksa ilk sonuç seçilir ("istanbul" + Enter)
      const opt = open ? options[active >= 0 ? active : 0] : undefined
      if (opt) {
        e.preventDefault()
        choose(opt)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
        setActive(-1)
      } else if (text) {
        setText('')
      }
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const disabled = state.status !== 'ready'
  const activeId = open && active >= 0 && options[active] ? `${baseId}-opt-${active}` : undefined

  return (
    <div className="place-search">
      <label htmlFor={inputId}>İl ya da ilçe ara</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder={state.status === 'error' ? 'Yer listesi yüklenemedi' : 'İl ya da ilçe ara…'}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} ref={listRef} role="listbox" aria-label="Sonuçlar" className="place-search-list" hidden={!open}>
        {open && options.length === 0 && (
          <li className="place-search-empty" role="presentation">Sonuç yok</li>
        )}
        {options.map((opt, i) => (
          <li
            key={opt.id}
            id={`${baseId}-opt-${i}`}
            data-index={i}
            role="option"
            aria-selected={i === active}
            className="place-search-option"
            // Odak kutuda kalsın (blur listeyi kapatmasın)
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(opt)}
          >
            <span>{opt.label}</span>
            <span className="place-search-kind">{opt.detail}</span>
          </li>
        ))}
      </ul>
      <p className="place-search-live" aria-live="polite">
        {selected ? announcement(selected, data) : ''}
      </p>
    </div>
  )
}
