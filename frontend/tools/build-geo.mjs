#!/usr/bin/env node
// Harita sınır verisini üretir: frontend/public/geo/{districts.json,provinces.json}
//
// Kaynaklar (ayrıntı: frontend/public/geo/README.md):
//   - geoBoundaries gbOpen TUR ADM2, commit 9469f09 (ham ilçe sınırları, ODbL)
//   - backend/src/main/resources/geo/districts.txt (ilçe adı, il ve merkez: backend ile BİREBİR aynı olsun diye)
//   - backend/src/main/resources/geo/province-centers.tsv (il merkezi)
//   - Wikidata P395 (plaka kodu, CC0)
//   - mapshaper (MPL-2.0, yalnızca derleme anında; `npx` ile çağrılır, package.json'a girmez)
//
// Kullanım (Node ≥ 23.6; place.ts tür silmeyle içe aktarılır, ağ erişimi gerekir):
//   node frontend/tools/build-geo.mjs [--work DIR] [--interval 500]
// Ham indirmeler --work dizininde önbelleğe alınır; aynı önbellekle çıktı bire bir aynıdır.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { slugify } from '../src/location/place.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const BACKEND_GEO = join(ROOT, 'backend', 'src', 'main', 'resources', 'geo')
const OUT_DIR = join(ROOT, 'frontend', 'public', 'geo')

const GB_COMMIT = '9469f09'
const GB_URL = `https://github.com/wmgeolab/geoBoundaries/raw/${GB_COMMIT}/releaseData/gbOpen/TUR/ADM2/geoBoundaries-TUR-ADM2.geojson`
const MAPSHAPER = 'mapshaper@0.6.121'
const UA = 'time-portal-geo-tool/1.0 (https://github.com/batuhanakdeniz/time-portal)'
const SPARQL = `SELECT ?item ?itemLabel ?plate WHERE {
  ?item wdt:P31 wd:Q48336 ; wdt:P395 ?plate .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "tr,en". }
}`
// Wikidata'da 25.10.2026 itibarıyla yanlış duran plaka kodları (Konya 53 = Rize'nin kodu, Uşak 62 = Tunceli'nin).
// Düzeltme yalnızca Wikidata değeri buradaki "yanlış" değerle aynıysa uygulanır; Wikidata düzelirse etkisizleşir.
const PLATE_FIXES = { Konya: { wrong: '53', right: '42' }, Uşak: { wrong: '62', right: '64' } }

function args() {
  const a = process.argv.slice(2)
  const get = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d)
  return { work: get('--work', join(tmpdir(), 'time-portal-geo-web')), interval: Number(get('--interval', '500')) }
}

const norm = (s) => slugify(s).replace(/-/g, '')

async function fetchCached(url, dest, headers = {}) {
  if (existsSync(dest) && statSync(dest).size > 0) return
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

// ---------------------------------------------------------------- kaynak dosyalar
function readDistrictsTxt() {
  const out = []
  for (const line of readFileSync(join(BACKEND_GEO, 'districts.txt'), 'utf8').split('\n')) {
    if (!line.startsWith('D\t')) continue
    const [, name, province, lat, lon] = line.split('\t')
    out.push({ name, province, lat: Number(lat), lon: Number(lon) })
  }
  return out
}

function readProvinceCenters() {
  const out = new Map()
  for (const line of readFileSync(join(BACKEND_GEO, 'province-centers.tsv'), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [name, lat, lon] = line.split('\t')
    out.set(name, { lat: Number(lat), lon: Number(lon) })
  }
  return out
}

async function readPlates(work, provinceNames) {
  const path = join(work, 'wikidata-plates.json')
  await fetchCached(`https://query.wikidata.org/sparql?query=${encodeURIComponent(SPARQL)}`, path, {
    Accept: 'application/sparql-results+json',
  })
  const byNorm = new Map()
  for (const b of JSON.parse(readFileSync(path, 'utf8')).results.bindings) {
    const k = norm(b.itemLabel.value)
    const list = byNorm.get(k) ?? []
    list.push(b.plate.value.trim().padStart(2, '0'))
    byNorm.set(k, list)
  }
  const plates = new Map()
  for (const name of provinceNames) {
    const values = [...new Set(byNorm.get(norm(name)) ?? [])].sort()
    if (values.length !== 1) throw new Error(`plaka kodu bulunamadı ya da birden çok: ${name} ${values}`)
    let plate = values[0]
    const fix = PLATE_FIXES[name]
    if (fix && plate === fix.wrong) {
      console.log(`  plaka düzeltmesi: ${name} ${fix.wrong} → ${fix.right} (Wikidata hatası)`)
      plate = fix.right
    }
    plates.set(name, plate)
  }
  // Doğrulama: 01..81 her kod tam bir kez
  const all = [...plates.values()].sort()
  const expected = Array.from({ length: 81 }, (_, i) => String(i + 1).padStart(2, '0'))
  if (all.join() !== expected.join()) throw new Error(`plaka kodları 01..81 değil: ${all}`)
  return plates
}

// ---------------------------------------------------------------- geometri
const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)

function inRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const inPolygons = (x, y, polys) =>
  polys.some((rings) => inRing(x, y, rings[0]) && !rings.slice(1).some((h) => inRing(x, y, h)))

function segDist2(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
}

function boundaryDist2(x, y, polys) {
  let best = Infinity
  for (const rings of polys)
    for (const r of rings) for (let i = 1; i < r.length; i++) best = Math.min(best, segDist2(x, y, r[i - 1], r[i]))
  return best
}

function bbox(polys) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const rings of polys)
    for (const [x, y] of rings[0]) {
      if (x < minLng) minLng = x
      if (x > maxLng) maxLng = x
      if (y < minLat) minLat = y
      if (y > maxLat) maxLat = y
    }
  return { minLng, minLat, maxLng, maxLat }
}

// districts.txt kaydını (ad + merkez) ham ADM2 poligonuyla eşler: merkez noktası poligonun içinde olmalı.
// Backend merkezleri ya poligon içinde doğrulanmış Wikidata noktası ya da poligonun iç noktasıdır.
function matchDistricts(records, features) {
  const shapes = features.map((f) => {
    const polys = polygonsOf(f.geometry)
    return { f, polys, box: bbox(polys) }
  })
  const used = new Set()
  const pending = []
  const match = new Map()
  for (const r of records) {
    const hits = shapes.filter(
      (s) =>
        s.box.minLng <= r.lon && r.lon <= s.box.maxLng && s.box.minLat <= r.lat && r.lat <= s.box.maxLat &&
        inPolygons(r.lon, r.lat, s.polys),
    )
    if (hits.length === 1 && !used.has(hits[0])) {
      used.add(hits[0])
      match.set(r, hits[0])
    } else pending.push(r)
  }
  // Sadeleştirilmiş poligonun iç noktası ham sınırın hemen dışına düşebilir: en yakın boştaki poligon
  for (const r of pending) {
    let best = null
    let bestD = Infinity
    for (const s of shapes) {
      if (used.has(s)) continue
      const d = inPolygons(r.lon, r.lat, s.polys) ? 0 : boundaryDist2(r.lon, r.lat, s.polys)
      if (d < bestD) [best, bestD] = [s, d]
    }
    if (!best || bestD > 0.003 ** 2) throw new Error(`ham poligon bulunamadı: ${r.province}/${r.name}`)
    console.log(`  yakınlıkla eşlendi: ${r.province}/${r.name} (${best.f.properties.shapeName})`)
    used.add(best)
    match.set(r, best)
  }
  return match
}

// ---------------------------------------------------------------- mapshaper
function runMapshaper(work, input, interval) {
  const districtsOut = join(work, 'districts.ms.json')
  const provincesOut = join(work, 'provinces.ms.json')
  const cmd = [
    '-y', MAPSHAPER,
    '-i', input,
    // Ortak topoloji: komşu ilçeler aynı sınırı paylaşır, sadeleştirme iki tarafta aynı kalır
    '-simplify', 'dp', `interval=${interval}`, 'keep-shapes',
    '-o', districtsOut, 'format=geojson', 'precision=0.001',
    '-dissolve', 'plate', 'copy-fields=province',
    '-o', provincesOut, 'format=geojson', 'precision=0.001',
  ]
  const res = spawnSync('npx', cmd, { encoding: 'utf8' })
  const log = `${res.stdout}${res.stderr}`
  if (res.status !== 0) throw new Error(`mapshaper başarısız:\n${log}`)
  // Sadeleştirmenin ürettiği kesişimler: onarılan ve onarılamayan
  const repaired = Number(/Repaired (\d+) intersection/.exec(log)?.[1] ?? 0)
  const unrepaired = Number(/(\d+) intersections? could not be repaired/.exec(log)?.[1] ?? 0)
  return { log, repaired, unrepaired, districtsOut, provincesOut }
}

const r5 = (n) => Math.round(n * 1e5) / 1e5
const r3 = (n) => Math.round(n * 1e3) / 1e3

function writeJson(path, fc) {
  const text = JSON.stringify(fc) + '\n'
  writeFileSync(path, text)
  return { raw: Buffer.byteLength(text), gz: gzipSync(text, { level: 9 }).length }
}

async function main() {
  const { work, interval } = args()
  mkdirSync(work, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const adm2Path = join(work, `${GB_COMMIT}-ADM2.geojson`)
  await fetchCached(GB_URL, adm2Path)
  const adm2 = JSON.parse(readFileSync(adm2Path, 'utf8'))
  const records = readDistrictsTxt()
  const centers = readProvinceCenters()
  const provinceNames = [...centers.keys()]
  if (records.length !== adm2.features.length)
    throw new Error(`districts.txt ${records.length} ilçe, ADM2 ${adm2.features.length} birim`)
  for (const r of records) if (!centers.has(r.province)) throw new Error(`il merkezi yok: ${r.province}`)
  const plates = await readPlates(work, provinceNames)

  // Ham poligonlara districts.txt'in ad, il ve merkezini yaz
  const match = matchDistricts(records, adm2.features)
  const seen = new Set()
  const features = records.map((r) => {
    const plate = plates.get(r.province)
    const slug = slugify(r.name)
    const key = `${plate}-${slug}`
    if (seen.has(key)) throw new Error(`il içinde slug çakışması: ${key}`)
    seen.add(key)
    return {
      type: 'Feature',
      properties: { key, plate, slug, name: r.name, province: r.province, lat: r.lat, lon: r.lon },
      geometry: match.get(r).f.geometry,
    }
  })
  const input = join(work, 'districts-raw.geojson')
  writeFileSync(input, JSON.stringify({ type: 'FeatureCollection', features }))

  const { log, repaired, unrepaired, districtsOut, provincesOut } = runMapshaper(work, input, interval)
  const msDistricts = JSON.parse(readFileSync(districtsOut, 'utf8'))
  const msProvinces = JSON.parse(readFileSync(provincesOut, 'utf8'))

  const byPlate = (a, b) => a.properties.plate.localeCompare(b.properties.plate)
  const districts = {
    type: 'FeatureCollection',
    features: msDistricts.features
      .map((f) => {
        const p = f.properties
        return {
          type: 'Feature',
          properties: { key: p.key, plate: p.plate, slug: p.slug, name: p.name, province: p.province, lat: r5(p.lat), lon: r5(p.lon) },
          geometry: f.geometry,
        }
      })
      .sort((a, b) => byPlate(a, b) || a.properties.slug.localeCompare(b.properties.slug)),
  }
  const provinces = {
    type: 'FeatureCollection',
    features: msProvinces.features
      .map((f) => {
        const { plate, province } = f.properties
        const b = bbox(polygonsOf(f.geometry))
        const c = centers.get(province)
        return {
          type: 'Feature',
          properties: {
            plate, name: province,
            minLng: r3(b.minLng), minLat: r3(b.minLat), maxLng: r3(b.maxLng), maxLat: r3(b.maxLat),
            centerLat: r5(c.lat), centerLon: r5(c.lon),
          },
          geometry: f.geometry,
        }
      })
      .sort(byPlate),
  }
  if (districts.features.length !== 973 || provinces.features.length !== 81)
    throw new Error(`beklenmeyen sayı: ${districts.features.length} ilçe, ${provinces.features.length} il`)

  const ds = writeJson(join(OUT_DIR, 'districts.json'), districts)
  const ps = writeJson(join(OUT_DIR, 'provinces.json'), provinces)
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`
  console.log(log.trim())
  console.log(`kesişim: ${repaired} onarıldı, ${unrepaired} onarılamadı`)
  console.log(`kaynak: geoBoundaries gbOpen TUR ADM2 ${GB_COMMIT}; ${MAPSHAPER} -simplify dp interval=${interval} keep-shapes`)
  console.log(`districts.json: ${districts.features.length} ilçe, ${kb(ds.raw)} (gzip ${kb(ds.gz)})`)
  console.log(`provinces.json: ${provinces.features.length} il, ${kb(ps.raw)} (gzip ${kb(ps.gz)})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
