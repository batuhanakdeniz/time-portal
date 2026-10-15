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
{"year": -44, "latitude": 41.9, "longitude": 12.5}
```

Yanıt `202 Accepted`, `Location: /api/scenes/{id}`:

```json
{
  "id": "5b0c…",
  "status": "PENDING",
  "request": {"year": -44, "latitude": 41.9, "longitude": 12.5},
  "result": null,
  "error": null,
  "createdAt": "2026-10-15T15:30:00Z"
}
```

Hatalar: `400` (geçersiz ya da eksik alan).

## `GET /api/scenes/{id}` — durum ve sonuç

`200` ve aynı gövde, ya da bilinmeyen kimlik için `404`.

| `status` | Anlamı | `result` | `error` |
|---|---|---|---|
| `PENDING` | Sırada | `null` | `null` |
| `RUNNING` | Üretiliyor | `null` | `null` |
| `READY` | Hazır | dolu | `null` |
| `FAILED` | Başarısız | `null` | mesaj |

Geçişler: `PENDING → RUNNING → READY | FAILED`. İstemci `READY` ya da `FAILED` olana kadar kısa aralıklarla sorgular.

`READY` olduğunda:

```json
"result": {
  "panoramaUrl": "/api/samples/sample-pano.png",
  "depthUrl": "/api/samples/sample-depth.png"
}
```

- `panoramaUrl`: equirectangular (2:1) panorama.
- `depthUrl`: aynı boyutta gri tonlu derinlik haritası. Hangi ucun yakın/uzak olduğu gerçek üretici (#8) seçilince netleşir ve burada belirtilir. Örnekte yukarıdan aşağıya koyudan açığa gider.
- Adresler sunucuya göre köke bağlıdır, doğrudan yüklenebilir.

## Örnek yapıtlar

Gerçek üretici (#8) gelene kadar her istek aynı örnekleri döner: `/api/samples/sample-pano.png`, `/api/samples/sample-depth.png` (1024×512). Yol `/api` altında olduğu için geliştirmede proxy'den geçer.
