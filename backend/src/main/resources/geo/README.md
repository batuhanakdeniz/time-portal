# Türkiye ilçe verisi

`districts.txt`: 973 ilçenin sadeleştirilmiş sınır poligonları, ilçe merkezleri ve il adları. Backend başlangıçta bir kez yükler (`com.timeportal.geo.PolygonDistrictLocator`), tamamen çevrimdışıdır.

## Kaynaklar, lisans ve atıf

| Veri | Kaynak | Lisans |
|---|---|---|
| İlçe sınırları (ADM2) ve il sınırları (ADM1, yalnızca ilçe→il eşlemesi için) | [geoBoundaries](https://www.geoboundaries.org/) gbOpen TUR, sürüm 9469f09 (kaynak veri: OpenStreetMap / osm-boundaries.com, 2023-01-19) | **Open Data Commons Open Database License 1.0 (ODbL)**. Atıf: © OpenStreetMap contributors, geoBoundaries |
| İlçe merkez koordinatları | [Wikidata](https://www.wikidata.org/) SPARQL (sınıf Q1147395 "district of Turkey", P625, P131) | CC0 |

ODbL gereği türetilmiş veritabanı (`districts.txt`) aynı lisansla paylaşılır ve atıf korunur. Arayüzde harita/ilçe verisi gösterilirken "© OpenStreetMap contributors" atfı yer almalıdır.

Not: Görev metnindeki Wikidata sınıfı Q1187811 yanlış çıktı (Berlin vb. döndürüyor); doğrusu Q1147395.

## Üretim

```
python3 backend/tools/build_geo.py [--work DIR] [--tolerance 0.0015] [--out YOL]
```

Yalnızca Python 3 standart kütüphanesi gerekir; ağ erişimi ister. Ham indirmeler `--work` dizininde önbelleğe alınır (varsayılan: sistem geçici dizini), betik tekrar çalıştırılabilir ve aynı girdiyle aynı çıktıyı verir. Betik özet ve eşleşmeyen ilçelerin listesini yazdırır.

## İşlem

- **Sadeleştirme:** Douglas–Peucker, tolerans 0,0015° (~150 m), koordinatlar 4 ondalığa (~11 m) yuvarlanır. Halkalar bağımsız sadeleştirildiğinden komşu ilçeler arasında dar boşluk/çakışma olabilir; arayıcı bunu, hiçbir poligon içermiyorsa sınıra 0,003° (~300 m) içindeki en yakın ilçeyi seçerek karşılar.
- **İlçe adları:** `Hakkari merkez`, `Osmaniye (merkez)`, `Giresun District` gibi yazımlar `Merkez` olur; `Imbros` → `Gökçeada`, `Prince Islands` → `Adalar`; `â/î/û` düzleştirilir (`Hakkâri` → `Hakkari`). `Merkezefendi` gibi gerçek adlara dokunulmaz.
- **İl:** ilçenin iç noktası hangi ADM1 poligonundaysa o ildir.
- **Merkez noktası:** Wikidata'da adı eşleşen ve koordinatı ilçe poligonunun içinde kalan kayıt (kaynak `W`). Aksi halde poligonun iç noktası (sınırdan en uzak nokta yaklaşımı, centroid değil; kaynak `I`).

## Eşleşme istatistiği (son üretim)

- Toplam ilçe: 973; dosya boyutu ~1,7 MB
- Wikidata merkezi eşleşen: 923
- **Eşleşmeyen (merkez = poligon iç noktası): 50** (bunların 15'inde ad eşleşti ama Wikidata noktası poligon dışında kaldı)

## Dosya biçimi

UTF-8, satır tabanlı; `#` ile başlayan satırlar yorumdur.

```
D<TAB>ad<TAB>il<TAB>enlem<TAB>boylam<TAB>W|I     yeni ilçe (W: Wikidata merkezi, I: iç nokta)
P                                                yeni poligon parçası (MultiPolygon için birden çok)
O x y x y ...                                    dış halka (x = boylam, y = enlem; halka açık)
H x y x y ...                                    delik (isteğe bağlı, birden çok olabilir)
```
