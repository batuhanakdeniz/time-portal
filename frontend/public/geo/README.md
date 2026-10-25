# Harita sınır verisi (il/ilçe)

`provinces.json` (81 il) ve `districts.json` (973 ilçe): altlıksız seçim haritasının (`TurkeyMap`) ve aramanın (`PlaceSearch`) verisi. Tarayıcı `/geo/*.json` olarak bir kez indirir (`usePlaces`). Dosyalar elle düzenlenmez; `frontend/tools/build-geo.mjs` üretir.

## Kaynaklar, lisans ve atıf

| Veri | Kaynak | Lisans |
|---|---|---|
| İlçe sınırları; il sınırları ilçelerden birleştirilir | [geoBoundaries](https://www.geoboundaries.org/) gbOpen TUR ADM2, commit `9469f09` (kaynak: OpenStreetMap) | **Open Data Commons Open Database License 1.0 (ODbL)** — © OpenStreetMap katkıcıları, geoBoundaries |
| İlçe adı, ili ve merkezi | `backend/src/main/resources/geo/districts.txt` (birebir aynı; kaynakları orada) | ODbL + Wikidata CC0 |
| İl merkezi | `backend/src/main/resources/geo/province-centers.tsv` | Wikidata CC0 |
| Plaka kodu | [Wikidata](https://www.wikidata.org/) P395 (sınıf Q48336 "province of Turkey") | CC0 |

Bu iki dosya ODbL kapsamında **uyarlanmış veritabanıdır**: aynı lisansla paylaşılır, atıf korunur. Harita atıf kontrolünde "© OpenStreetMap katkıcıları, geoBoundaries (ODbL)" görünür.

## Şema

`provinces.json` özellikleri: `plate` ("34"), `name` ("İstanbul"), `minLng`, `minLat`, `maxLng`, `maxLat` (sınır kutusu; dizi değil, MapLibre sorgusu dizileri metne çevirdiği için), `centerLat`, `centerLon` (il merkezi).

`districts.json` özellikleri: `key` ("34-beyoglu"; haritada `promoteId`), `plate`, `slug` (`slugify(name)`, il içinde benzersiz), `name`, `province`, `lat`, `lon` (ilçe merkezi, `districts.txt` ile aynı 5 ondalık).

Geometri `Polygon`/`MultiPolygon`, koordinatlar 3 ondalık (~100 m).

İl adı etiketi `centerLat/centerLon`'a yazılır. Merkez sadeleştirilmiş il sınırının dışında kalıyorsa (şu an yalnızca Çanakkale: merkez kıyı çizgisinin dışında, suya düşüyor) etiket aynı enlemde en yakın kara parçasının ~4 km içine kayar (`turkeyStyle.ts` `labelPoint`). Veri değişmez: `centerLat/centerLon` backend'le aynı kalır, sahne isteği bu koordinatı kullanır.

## Üretim

```
node frontend/tools/build-geo.mjs [--work DIR] [--interval 500]
```

Node ≥ 23.6 (TypeScript tür silme: `slugify` doğrudan `src/location/place.ts`'ten gelir) ve ağ erişimi gerekir. mapshaper (MPL-2.0) `npx -y mapshaper@0.6.121` ile yalnızca derleme anında çalışır; `package.json`'a girmez. Ham indirmeler `--work` dizininde (varsayılan: sistem geçici dizini/`time-portal-geo-web`) önbelleğe alınır; aynı önbellekle çıktı bire bir aynıdır. Wikidata sorgusu ilk çalıştırmada canlıdır.

Adımlar:

1. Ham ADM2 (973 birim) indirilir. Her `districts.txt` kaydı, merkezi içinde kalan ham poligonla eşlenir (973/973 doğrudan eşleşti).
2. Plaka kodları Wikidata P395'ten gelir. 25.10.2026'da Wikidata'da iki yanlış değer vardı (Konya 53, Uşak 62); betik yalnızca bu iki bilinen yanlışı düzeltir (Konya 42, Uşak 64) ve kodların 01–81 arası her birinin tam bir kez geçtiğini doğrular.
3. mapshaper, **ortak topolojiyle** sadeleştirir: `-simplify dp interval=500 keep-shapes`. Komşu ilçeler aynı sınırı paylaşır, aralarında boşluk/çakışma oluşmaz. Son üretim: sadeleştirmenin yol açtığı 23 kesişim onarıldı, onarılamayan 0.
4. İller ilçelerden `-dissolve plate` ile üretilir (il ve ilçe sınırları birebir çakışır).
5. Çıktı `precision=0.001`; özellikler eklenir, il ve ilçeler plaka/slug sırasına dizilir.

## Boyut (son üretim)

| Dosya | Ham | gzip |
|---|---|---|
| `districts.json` | 852 KB | 200 KB (hedef ≤ 250 KB) |
| `provinces.json` | 268 KB | 78 KB (hedef ≤ 120 KB) |

Testler (`places.test.ts`) sayıları, şemayı, `districts.txt`/`province-centers.tsv` ile birebir aynılığı ve boyut bütçesini denetler.
