# Time Portal

Zaman çizgisinden tarih + dünya üzerinden konum seç → yapay zekayla üretilmiş, 360° dönülebilen ve küçük alanda gezilebilen 3D sahne.
Kararlar ve mimari: `docs/DURUM.md`. Görevler: `docs/BACKLOG.md`.

## Komutlar

Backend ve frontend iskeleti kurulunca burası doldurulur (Backlog 1 ve 2).

- Backend test: `./mvnw test`
- Frontend: `npm --prefix web run build`, `npm --prefix web test`

## Çalışma kuralları

- **Önce sor:** Yeni ekran, tasarım ve kapsam kararlarında önce seçenekleri sun, sonra kodla. Backlog'da `[insan]` işaretli işleri kodlama, `docs/SORULAR.md`'ye yaz.
- **Test kapısı:** Her değişiklik testler geçmeden commit edilmez.
- **Dal:** Otomatik işler `auto/<görev-no>` dalında çalışır, `main`'e insan onayıyla birleşir.
- **Sır yok:** API anahtarları yalnızca ortam değişkenlerinde. Depoya, loglara ve testlere girmez.
- **Üretici soyutlaması:** Harici AI servisleri her zaman `SceneGenerator`, `PromptComposer` gibi arayüzlerin arkasında. Testler gerçek servisi çağırmaz.
- **Dil:** Kod ve değişken adları İngilizce, dokümantasyon ve commit mesajları Türkçe.
