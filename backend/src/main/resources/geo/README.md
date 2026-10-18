# Türkiye ilçe verisi

`districts.txt`: 973 ilçenin sadeleştirilmiş sınır poligonları, ilçe merkezleri ve il adları. Backend başlangıçta bir kez yükler (`com.timeportal.geo.PolygonDistrictLocator`), tamamen çevrimdışıdır.

## Kaynaklar, lisans ve atıf

| Veri | Kaynak | Lisans |
|---|---|---|
| İlçe sınırları (ADM2) ve il sınırları (ADM1, yalnızca ilçe→il eşlemesi için) | [geoBoundaries](https://www.geoboundaries.org/) gbOpen TUR, sürüm 9469f09 (kaynak veri: OpenStreetMap / osm-boundaries.com, 2023-01-19) | **Open Data Commons Open Database License 1.0 (ODbL)**. Atıf: © OpenStreetMap contributors, geoBoundaries |
| İlçe merkez koordinatları | [Wikidata](https://www.wikidata.org/) SPARQL (sınıf Q1147395 "district of Turkey", P625, P131) | CC0 |
| İl merkezi koordinatları (`province-centers.tsv`) | [Wikidata](https://www.wikidata.org/) SPARQL (sınıf Q48336 "province of Turkey"; il başkenti P36 → P625, yoksa ilin kendi P625'i), 18.10.2026 | CC0 |

ODbL gereği türetilmiş veritabanı (`districts.txt`) aynı lisansla paylaşılır ve atıf korunur. Arayüzde harita/ilçe verisi gösterilirken "© OpenStreetMap contributors" atfı yer almalıdır.

Not: Görev metnindeki Wikidata sınıfı Q1187811 yanlış çıktı (Berlin vb. döndürüyor); doğrusu Q1147395.

## Üretim

```
python3 backend/tools/build_geo.py [--work DIR] [--tolerance 0.0015] [--out YOL]
```

Yalnızca Python 3 standart kütüphanesi gerekir; ağ erişimi ister. geoBoundaries sınırları sürüme sabitli URL'den (commit `9469f09`) iner. **Wikidata sorgusu canlıdır**: Wikidata değişirse merkez noktaları değişebilir; bire bir aynı çıktı yalnızca `--work` önbelleğiyle (`wikidata-districts.json`) elde edilir. Adaylar sıralanarak seçildiğinden aynı girdiyle çıktı deterministiktir. Ham indirmeler `--work` dizininde önbelleğe alınır (varsayılan: sistem geçici dizini), betik tekrar çalıştırılabilir ve aynı girdiyle aynı çıktıyı verir. Betik özet ve eşleşmeyen ilçelerin listesini yazdırır.

## İşlem

- **Sadeleştirme:** Douglas–Peucker, tolerans 0,0015° (~150 m), koordinatlar 4 ondalığa (~11 m) yuvarlanır. Halkalar bağımsız sadeleştirildiğinden komşu ilçeler arasında dar boşluk/çakışma olabilir; arayıcı bunu, hiçbir poligon içermiyorsa sınıra 0,003° (~300 m) içindeki en yakın ilçeyi seçerek karşılar.
- **İlçe adları:** `Hakkari merkez`, `Osmaniye (merkez)`, `Giresun District` gibi yazımlar `Merkez` olur; `Imbros` → `Gökçeada`, `Prince Islands` → `Adalar`; `â/î/û` düzleştirilir (`Hakkâri` → `Hakkari`). `Merkezefendi` gibi gerçek adlara dokunulmaz.
- **İl:** ilçenin iç noktası hangi ADM1 poligonundaysa o ildir.
- **Merkez noktası:** Wikidata'da adı eşleşen ve koordinatı ilçe poligonunun içinde kalan kayıt (kaynak `W`). Aksi halde poligonun iç noktası (sınırdan en uzak nokta yaklaşımı, centroid değil; kaynak `I`).

## Eşleşme istatistiği (son üretim)

- Toplam ilçe: 973; dosya boyutu ~1,7 MB
- Wikidata merkezi eşleşen: 927
- **Eşleşmeyen (merkez = poligon iç noktası): 46** (bunların 11'inde ad eşleşti ama Wikidata noktası poligon dışında kaldı)

## Dosya biçimi

UTF-8, satır tabanlı; `#` ile başlayan satırlar yorumdur (ilk satır ODbL lisans/atıf başlığıdır).

```
D<TAB>ad<TAB>il<TAB>enlem<TAB>boylam<TAB>W|I     yeni ilçe (W: Wikidata merkezi, I: iç nokta)
P                                                yeni poligon parçası (MultiPolygon için birden çok)
O x y x y ...                                    dış halka (x = boylam, y = enlem; halka açık)
H x y x y ...                                    delik (isteğe bağlı, birden çok olabilir)
```

## İl merkezleri (`province-centers.tsv`)

81 ilin merkez noktası; `com.timeportal.geo.ProvinceCenters` yükler ve görsel zincirinin son adımında (#40, il merkezine yakın Commons fotoğrafı) kullanılır. Biçim: `il<TAB>enlem<TAB>boylam<TAB>C|P` (`C`: il başkentinin (şehir merkezi) koordinatı, `P`: başkent koordinatı yoksa ilin kendi koordinatı; şu an yalnızca Bingöl `P`). İl adları `districts.txt`'deki yazımla bire bir aynıdır. Neden başkent: ilin kendi P625 değeri çoğu zaman il yüzölçümünün ortasıdır (ör. Antalya'da şehir merkezinin ~35 km kuzeyi), şehir merkezi değildir.

Sorgu (WDQS, `Accept: application/sparql-results+json`):

```
SELECT ?item ?itemLabel ?cap ?coord ?pcoord WHERE {
  ?item wdt:P31 wd:Q48336 .
  OPTIONAL { ?item wdt:P36 ?cap . ?cap wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P625 ?pcoord }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "tr,en". }
}
```
