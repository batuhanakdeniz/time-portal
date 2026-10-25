# API sözleşmesi

Frontend ve backend arasındaki tek sözleşme budur. Biri değişince bu dosya aynı PR'da güncellenir.
Karar: [#14](https://github.com/batuhanakdeniz/time-portal/issues/14) → elle yazılan `docs/API.md` (OpenAPI'a ileride geçilebilir).

Genel: JSON, UTF-8. Hata gövdesi `{"error": "<mesaj>"}`. Geliştirmede frontend `/api` isteklerini `http://localhost:8081`'e proxy eder.

## Alan kuralları

| Alan | Tür | Kural |
|---|---|---|
| `year` | tamsayı | Negatif = MÖ (MÖ 44 → `-44`). Yıl `0` yoktur. Aralık: -100000 … 100000 |
| `latitude` | sayı | -90 … 90 |
| `longitude` | sayı | -180 … 180 |

Üçü de zorunludur. Eksik, aralık dışı, tamsayı olmayan yıl (`1.5`), bozuk JSON ya da yanlış tür `400` döner. Tüm hatalarda gövde `{"error": "<mesaj>"}` biçimindedir (`404` dahil).

## `GET /api/health`

```json
{"status": "UP", "service": "time-portal"}
```

## `POST /api/scenes` — sahne üretimi başlat

İstek:

```json
{"year": 2026, "latitude": 41.0369, "longitude": 28.985}
```

Yanıt `202 Accepted`, `Location: /api/scenes/{id}`:

```json
{
  "id": "5b0c…",
  "status": "PENDING",
  "stage": null,
  "request": {"year": 2026, "latitude": 41.0369, "longitude": 28.985},
  "result": null,
  "error": null,
  "createdAt": "2026-10-15T15:30:00Z"
}
```

Hatalar: `400` (geçersiz ya da eksik alan; ayrıca konum Türkiye ilçe sınırları dışındaysa, yani deniz ya da yurt dışıysa `{"error": "location outside supported area"}`); `503` + `Retry-After: 5` (saniye) başlığı ve `{"error": "..."}` gövdesi: aynı anda bekleyen+çalışan iş sayısı sınırına (`timeportal.jobs.max-active`, varsayılan 4) ulaşıldı. İstemci `Retry-After` kadar bekleyip yeniden dener.

## `GET /api/scenes/{id}` — durum ve sonuç

`200` ve aynı gövde, ya da bilinmeyen kimlik için `404`. Biten (`READY`/`FAILED`) işler bitişlerinden `timeportal.jobs.ttl` (varsayılan 1 saat) sonra bellekten silinir; sonrasında aynı kimlik `404` döner. `PENDING`/`RUNNING` işler silinmez. Bellekte en çok `timeportal.jobs.max-retained` (varsayılan 1000) biten iş tutulur; bu sayı aşılırsa en eski biten işler TTL dolmadan da `404` dönebilir.

| `status` | Anlamı | `result` | `error` |
|---|---|---|---|
| `PENDING` | Sırada | `null` | `null` |
| `RUNNING` | Üretiliyor | `null` | `null` |
| `READY` | Hazır | dolu | `null` |
| `FAILED` | Başarısız | `null` | `no scene for period`, `no image found for location` ya da `generation failed` |

`FAILED` mesajları:

- `no scene for period`: yıl kurgu bir dönem kovasında (aşağıda `period.confidence = kurgu`: Paleolitik, Neolitik, Yakın gelecek, Uzak gelecek). Sahne üretilmez, görsel araması da yapılmaz; iş hemen `RUNNING`'den `FAILED`'e geçer (karar 7A). Arayüz: "Bu dönem için sahne henüz yok."
- `no image found for location`: konum için hiçbir adımda açık lisanslı görsel bulunamadı (beklenen durum).
- `generation failed`: diğer tüm hatalar; iç ayrıntı istemciye verilmez, yalnızca sunucu logunda tutulur.

### `stage` — çalışan işin aşaması

```json
"stage": "LOCATING" | "IMAGE_SEARCH" | "DEPTH" | "PACKAGING" | null
```

Yalnızca `RUNNING` iken dolu olabilir; `PENDING`, `READY`, `FAILED`'de her zaman `null`. Sıra: `LOCATING` (konum → ilçe) → `IMAGE_SEARCH` (görsel arama ve indirme) → `DEPTH` (derinlik çıkarımı) → `PACKAGING` (saklama, sonucun kurulması). Notlar:

- `RUNNING`'e geçişle ilk bildirim arasında kısa süre `null` olabilir.
- Önbellekten dönen sonuçta aşamalar atlanabilir (gerçek üreticide yalnızca `LOCATING` görünür, ardından `READY`).
- Aynı ilçe için süren bir hesabı bekleyen iş, kendi işini değil o hesabın (sahibinin) aşamasını gösterir.
- İstemci aşamaları geri gitmeyen bir ilerleme olarak gösterebilir; ara aşamalar sorgu aralığına göre görünmeyebilir.

Geçişler: `PENDING → RUNNING → READY | FAILED`. İstemci `READY` ya da `FAILED` olana kadar kısa aralıklarla sorgular. Gerçek üreticide ilk istek ilçe görseli aramasıyla ve (ilk kez) model indirmesiyle onlarca saniye sürebilir; aynı ilçe sonraki isteklerde önbellekten hemen döner.

`READY` olduğunda:

```json
"result": {
  "panoramaUrl": "/api/artifacts/f09d7150caeb3ca4.jpg",
  "depthUrl": "/api/artifacts/f09d7150caeb3ca4-depth.png",
  "kind": "panorama",
  "place": {"province": "İstanbul", "district": "Beyoğlu"},
  "period": {"id": "osmanli-klasik", "name": "Osmanlı klasik", "yearFrom": 1453, "yearTo": 1700, "confidence": "yorum"},
  "attribution": {
    "author": "Ali Veli",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "sourceUrl": "https://www.mapillary.com/app/?pKey=123",
    "provider": "mapillary"
  }
}
```

- `panoramaUrl`: görselin adresi. `kind` `panorama` ise equirectangular (2:1) 360° panorama, `photo` ise düz fotoğraf (2.5B). Fotoğrafta da bu alan görseli taşır (ad tarihseldir).
- `depthUrl`: aynı boyutta gri tonlu derinlik haritası. **Açık = yakın, koyu = uzak** (#5 Karar 4A). Panoramada sol/sağ kenar sürekli (0°/360° dikişi), üst/alt kutup şeridi yumuşatılmıştır.
- `kind`: `"panorama"` | `"photo"`.
- `place`: konumun ilçesi ve ili; bilinmiyorsa `null`.
- `attribution`: görsel atfı (lisans gereği gösterilmelidir). `provider`: `"mapillary"` | `"wikimedia-commons"` | `"sample"` (örnek yapıtlar). `licenseUrl` bilinmiyorsa `null` olabilir. `attribution` bilinmiyorsa `null`.
- `period`: istekteki yılın dönem kovası (tablo: `docs/FAZ3.md` §2). `yearFrom` dahil, `yearTo` hariç; yıl 0 yoktur. `confidence`: `"gercek"` (Bugün, 2000–2029: 2026 görünümü) | `"yorum"` (Tunç Çağı … 20. yüzyıl sonu: dönem sahneleri üretilene kadar **bugünkü** sahne döner, `period` seçilen dönemi taşır; arayüz "Şimdilik 2026 görünümü; <Dönem adı> sahnesi hazırlanıyor" notu gösterir) | `"kurgu"` (bu kovalarda iş `no scene for period` ile `FAILED` olur, `READY` sonucunda görünmez). Eski sürüm sonuçlarında `null` olabilir.
- Adresler sunucuya göre köke bağlıdır, doğrudan yüklenebilir.
- Panorama genişliği en çok 4096 px, fotoğrafın uzun kenarı en çok 2048 px'tir.

## `GET /api/artifacts/{name}` — üretilen görsel ve derinlik

Gerçek üreticinin indirdiği görsel ve derinlik PNG'leri. Mapillary adresleri imzalı ve süreli olduğu için görsel hotlink edilmez, backend saklar ve buradan sunar. `{name}` yalnızca `[a-f0-9]{16}(-depth)?.(jpg|png)` olabilir (içerik özeti). `Content-Type` uzantıya göre `image/jpeg` ya da `image/png`; `Cache-Control: public, max-age=31536000, immutable`. Kalıba uymayan ya da olmayan ad `404` ve `{"error": "artifact not found"}` döner. Disk sınırı aşılınca en eski yapıtlar silinir (sonra `404`; ilgili ilçe bir sonraki istekte yeniden hesaplanır).

## Örnek yapıtlar

`timeportal.generator=fake` iken (geliştirme ve CI) her istek aynı örnekleri döner (`period` yine istekteki yıldan dolar; kurgu kovalar yine `no scene for period` ile `FAILED` olur; aşamalar sırayla bildirilir, `timeportal.fake-generator.delay-ms` verilirse aşamalara eşit bölünür): `/api/samples/sample-pano.png`, `/api/samples/sample-depth.png` (1024×512). Yol `/api` altında olduğu için geliştirmede proxy'den geçer.
