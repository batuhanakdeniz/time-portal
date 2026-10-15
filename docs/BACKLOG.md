# Görev kuyruğu

Durumlar: `todo` / `doing` / `done` / `blocked`. Otomasyon yalnızca **[oto]** işaretli görevleri alır. **[insan]** görevler karar ya da gerçek anahtar/veri ister, ajan bunları kodlamaz, `docs/SORULAR.md`'ye yazar.

## Faz 2: Yürüyen iskelet

### 1. Backend iskeleti — `todo` [oto]
Spring Boot (Java 25) projesi, `/api/health`, test altyapısı.
**Kabul:** `./mvnw test` yeşil, `GET /api/health` 200 döner.

### 2. Frontend iskeleti — `todo` [oto]
Vite + React + TypeScript, Three.js bağımlılıkları, `/api` proxy'si.
**Kabul:** `npm run build` ve `npm test` yeşil.

### 3. Sahte üretici ve iş akışı — `todo` [oto]
`SceneGenerator` arayüzü, örnek panorama dönen `FakeSceneGenerator`, `POST /api/scenes` (iş oluşturur), `GET /api/scenes/{id}` (durum + sonuç).
**Kabul:** iş `PENDING → READY` olur, sonuç örnek panorama ve derinlik yolunu içerir. Birim ve entegrasyon testi var.

### 4. 360° görüntüleyici — `todo` [oto]
Örnek panoramayı küre içinde gösteren, fare/dokunmayla bakış yönünü değiştiren bileşen.
**Kabul:** bileşen testi, yatay 360° dönüş, dikey açı sınırlı.

### 5. Derinlikli sınırlı hareket — `todo` [oto]
Derinlik haritasıyla paralaks/mesh, kamera hareketi küçük bir yarıçapla sınırlı (ileri-geri).
**Kabul:** hareket sınırı birim testle doğrulanır, sınır dışına çıkılamaz.

### 6. Zaman çizgisi bileşeni — `todo` [insan]
Doğrusal olmayan ölçek, MÖ/MS yıl desteği, tarih seçimi.
**Karar:** görsel tasarım ve ölçek önce sorulur.

### 7. Konum seçici — `todo` [insan]
Harita ya da küre üzerinde konum seçimi.
**Karar:** harita kütüphanesi ve etkileşim tasarımı önce sorulur.

## Faz 3: Gerçek üretim

### 8. Gerçek üretici adaptörü — `todo` [insan]
Servis seçimi (DURUM.md açık karar 1), API anahtarı, adaptör.

### 9. PromptComposer — `todo` [oto]
Konum ve tarihten sahne tarifi üreten bileşen. LLM çağrısı arayüz arkasında, testte sahte.

### 10. Önbellek — `todo` [oto]
Konum hücresi + tarih dilimi anahtarıyla sonuç yeniden kullanımı.

### 11. Hız sınırı ve kota — `todo` [insan]
Eşik değerleri kullanıcıdan alınır (DURUM.md açık karar 3).

### 12. İçerik güvenliği — `todo` [insan]
Moderasyon yaklaşımı (açık karar 4).
