# Faz 3 sözleşmesi: çok sayfalı akış

Kararlar (#57, 25.10.2026): **1A** altlıksız MapLibre · **2A** il seçilince devam, ilçe isteğe bağlı · **3C** "höyük kesiti" yıl ekranı · **4A** 15 dönem kovası · **5A** karma üretim yolu · **6A** 20 sahnelik pilot · **7A** tarih öncesi ve gelecek için "sahne henüz yok" · **8A** React Router v8 + React `<ViewTransition>`.
Araştırma raporu: `docs/arastirma/faz2-arastirma-raporu.md`. Bu dosya, paralel çalışan işlerin **ortak sözleşmesidir**; bir iş bu sözleşmeyi değiştirmek isterse önce issue'ya yazar.

## 1. Sayfalar ve URL'ler

| Sayfa | URL | Not |
|---|---|---|
| Yıl seçimi | `/` | Son seçilen yıl `localStorage` (`tp.year`) |
| Harita | `/yil/:yil` ve `/yil/:yil/yer/:yer` | `:yil` = `1453` ya da `mo-1200` (MÖ). `-1200` gelirse `mo-1200`'e yönlendirilir |
| Sahne | `/yil/:yil/yer/:yer/sahne` | Paylaşılabilir bağlantı |

- `:yer` = `34` (yalnızca il, plaka kodu) ya da `34-beyoglu` (il + ilçe). İlçe slug'ı ASCII: `slugify('Beyoğlu') = 'beyoglu'`, `'Merkez' → 'merkez'`, `'Şebinkarahisar' → 'sebinkarahisar'`. Slug il içinde benzersizdir.
- Sayfa değişimi `push`, aynı sayfada seçim değişimi `replace`. Sahnedeki "←" haritaya döner; derin bağlantıyla gelindiyse üst rotaya `replace`.
- Yıl 0 yoktur; `/yil/0` → `/`'a yönlendirilir ve mesaj gösterilir.

## 2. Dönem kovaları (karar 4A; B raporu §2.1)

Başlangıç dahil, bitiş hariç. Yıl 0 yok. Kimlikler değişmez; backend ve frontend aynı tabloyu kullanır.

| # | `id` | Ad | yearFrom | yearTo | confidence |
|---|---|---|---|---|---|
| 1 | `paleolitik` | Paleolitik ve buzul çağı | -100000 | -10000 | kurgu |
| 2 | `neolitik` | Neolitik–Kalkolitik | -10000 | -3000 | kurgu |
| 3 | `tunc` | Tunç Çağı | -3000 | -1200 | yorum |
| 4 | `demir` | Demir Çağı | -1200 | -550 | yorum |
| 5 | `helenistik` | Pers–Helenistik | -550 | -30 | yorum |
| 6 | `roma` | Roma | -30 | 395 | yorum |
| 7 | `bizans` | Bizans | 395 | 1071 | yorum |
| 8 | `selcuklu` | Selçuklu–Beylikler | 1071 | 1453 | yorum |
| 9 | `osmanli-klasik` | Osmanlı klasik | 1453 | 1700 | yorum |
| 10 | `osmanli-gec` | Osmanlı geç | 1700 | 1923 | yorum |
| 11 | `erken-cumhuriyet` | Erken Cumhuriyet | 1923 | 1960 | yorum |
| 12 | `yirminci-yy-sonu` | 20. yüzyıl sonu | 1960 | 2000 | yorum |
| 13 | `bugun` | Bugün | 2000 | 2030 | gercek |
| 14 | `yakin-gelecek` | Yakın gelecek | 2030 | 2200 | kurgu |
| 15 | `uzak-gelecek` | Uzak gelecek | 2200 | 100001 | kurgu |

MÖ aralıkta "yearTo hariç" kuralı: MÖ 1200 (`-1200`) kova 4'e girer. `-30 … 395` kovası yıl 0'ı atlar (0 geçersiz).

**MVP davranışı (karar 7A):**
- `confidence = kurgu` (1, 2, 14, 15): sahne üretilmez; iş `FAILED`, `error = "no scene for period"`. Arayüz: "Bu dönem için sahne henüz yok."
- `confidence = yorum` (3–12): dönem sahneleri üretilene kadar **bugünkü** Faz 1 sahnesi döner (`period` alanı seçilen dönemi taşır); arayüz "Şimdilik 2026 görünümü; <Dönem adı> sahnesi hazırlanıyor" notu gösterir.
- `confidence = gercek` (13): Faz 1 sahnesi, not "2026 görünümü".

## 3. API ekleri (`docs/API.md` ile birlikte güncellenir)

`GET /api/scenes/{id}` gövdesine:

```json
"stage": "LOCATING" | "IMAGE_SEARCH" | "DEPTH" | "PACKAGING" | null
```
Yalnızca `RUNNING` iken dolu; sırası bu. `PENDING`, `READY`, `FAILED`'de `null`.

`result` içine:

```json
"period": {"id": "osmanli-klasik", "name": "Osmanlı klasik", "yearFrom": 1453, "yearTo": 1700, "confidence": "yorum"}
```

Yeni `FAILED` mesajı: `no scene for period`. Diğerleri aynı (`no image found for location`, `generation failed`).

## 4. Bileşen arayüzleri (frontend)

Tipler `frontend/src/api/scenes.ts` içinde (sahibi: #61'in frontend karşılığı #62):
```ts
export type SceneStage = 'LOCATING' | 'IMAGE_SEARCH' | 'DEPTH' | 'PACKAGING'
export interface ScenePeriod { id: string; name: string; yearFrom: number; yearTo: number; confidence: 'gercek' | 'yorum' | 'kurgu' }
// Scene.stage?: SceneStage | null ; SceneResult.period?: ScenePeriod | null
```

Yer seçimi tipi (`frontend/src/location/place.ts`, sahibi #59):
```ts
export interface PlaceSelection {
  plate: string            // "34"
  province: string         // "İstanbul"
  district?: { slug: string; name: string; lat: number; lon: number }
  center: { lat: number; lon: number }   // ilçe seçiliyse ilçe merkezi, değilse il merkezi
}
export function placeToSlug(p: PlaceSelection): string   // "34" | "34-beyoglu"
export function slugify(name: string): string
```

| Bileşen | Dosya | Props | Sahibi |
|---|---|---|---|
| `TurkeyMap` | `frontend/src/location/TurkeyMap.tsx` | `{ selected: PlaceSelection \| null; onSelect(p: PlaceSelection): void }` | #59 |
| `PlaceSearch` (liste/arama yedeği) | `frontend/src/location/PlaceSearch.tsx` | aynı props | #59 |
| `usePlaces()` | `frontend/src/location/places.ts` | `/geo/*.json` yükler; `findBySlug(slug) → PlaceSelection \| null` | #59 |
| `HoyukYearPicker` | `frontend/src/year/HoyukYearPicker.tsx` | `{ value: number; onChange(y: number): void; onConfirm(): void }` | #60 |
| `periods.ts` | `frontend/src/year/periods.ts` | Tablo (§2) + `bucketOf(year)` | #60 |
| `yearSlug.ts` | `frontend/src/routing/yearSlug.ts` | `yearToSlug(1453)='1453'`, `yearToSlug(-1200)='mo-1200'`, `parseYearSlug()` | #58 |
| `SceneOverlay` | `frontend/src/scene/SceneOverlay.tsx` | `{ year; place: {province, district?}; period?; kind; attribution?; onBack(); onShare() }` | #62 |
| `LoadingScreen` | `frontend/src/scene/LoadingScreen.tsx` | `{ stage: SceneStage \| null; elapsedMs; targetYear; onCancel() }` | #62 |
| `SceneError` | `frontend/src/scene/SceneError.tsx` | `{ kind: 'no-image' \| 'no-period' \| 'network' \| 'busy' \| 'timeout' \| 'unknown'; retryAfterSec?; onRetry(); onBack() }` | #62 |
| Sayfalar | `frontend/src/pages/YearPage.tsx`, `MapPage.tsx`, `ScenePage.tsx` | Router'a bağlı; iskelet #58, bileşenlerin bağlanması #63 | #58 → #63 |

Veri dosyaları (sahibi #59): `frontend/public/geo/provinces.json` (özellikler `plate`, `name`, `minLng`, `minLat`, `maxLng`, `maxLat`, `centerLat`, `centerLon`), `districts.json` (`plate`, `slug`, `name`, `province`, `lat`, `lon`), üretim betiği `frontend/tools/build-geo.mjs` (ham geoBoundaries + Wikidata plaka kodu P395, mapshaper ile ortak topoloji). ODbL atfı harita atıf kontrolünde.

## 5. Dosya sahipliği (çakışma önleme)

| Issue | Yalnızca bu dosyalara dokunur |
|---|---|
| #58 yönlendirme | `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/App.css`, `frontend/src/pages/**`, `frontend/src/routing/**`, `frontend/package.json` (react-router ekleme), `frontend/vite.config.ts` (SPA yedeği gerekirse), ilgili testler. Mevcut bileşenleri (Timeline, MapSection, ViewerSection, Attribution) **değiştirmeden** sayfalara koyar |
| #59 harita | `frontend/src/location/TurkeyMap*`, `PlaceSearch*`, `places.ts`, `place.ts`, `turkeyStyle.ts` (yeni dosyalar), `frontend/public/geo/**`, `frontend/tools/build-geo.mjs`, `frontend/package.json` yalnızca devDependency (mapshaper) gerekiyorsa. `LocationPicker`, `MapSection`, `turkey.ts`'e dokunmaz |
| #60 yıl ekranı | `frontend/src/year/**` (yeni), `frontend/src/timeline/scale.ts` yalnızca dışa aktarım gerekiyorsa (davranış değişmez) |
| #61 backend | `backend/src/main/java/com/timeportal/period/**` (yeni), `scene/SceneJob.java`, `SceneJobService.java`, `SceneResult.java`, `SceneController.java`, `CityImageSceneGenerator.java`, `FakeSceneGenerator.java`, `SceneGenerator.java` (stage callback), testleri, `docs/API.md` |
| #62 sahne arayüzü | `frontend/src/scene/SceneOverlay*`, `LoadingScreen*`, `SceneError*` (yeni), `frontend/src/api/scenes.ts` (yalnızca `stage`/`period` tipleri ve `sanitizeResult` eki), `frontend/src/api/errorMessages.ts` (`no scene for period` eki) |
| #63 entegrasyon (wave 2) | `pages/**`, `App.tsx`, eski `LocationPicker`/`MapSection`/`ScenePreview` kaldırma, ViewTransition |
| #64 503 yeniden deneme (wave 2) | `frontend/src/api/scenes.ts` (`createScene`/`waitForScene` yeniden deneme), `errorMessages.ts`, testleri |
| #65 2.5B bozulma (wave 2) | `frontend/src/scene/PhotoDepthViewer.tsx`, `photoDepth.ts`, testleri |
| #66 derinlik ölçeği (wave 2) | `backend/src/main/java/com/timeportal/depth/**`, testleri |
| #67 üretim pilotu (wave 3) | `backend/tools/pilot/**`, `docs/pilot/**` |

Ortak kurallar: yeni npm bağımlılığı yalnızca sözleşmede yazılıysa (react-router, mapshaper devDependency, topojson-client gerekirse). Türkçe metinler düz metin, `dangerouslySetInnerHTML` yok. Bağlantılar yalnızca `https:`. `prefers-reduced-motion` her animasyonda. Testler gerçek ağ ve gerçek model kullanmaz.
