# Time Portal

Zaman çizgisinden tarih + dünya üzerinden konum seç → yapay zekayla üretilmiş, 360° dönülebilen ve küçük alanda gezilebilen 3D sahne.
Kararlar ve mimari: `docs/DURUM.md`. Görevler: `docs/BACKLOG.md`.

## Yapı

Tek depo, iki bağımsız proje:

- `backend/` — Spring Boot (Java 25), kendi `pom.xml` ve Maven wrapper'ı
- `frontend/` — React + Vite + TypeScript, kendi `package.json`'ı

İkisi yalnızca HTTP (`/api`) ile konuşur. Biri diğerinin dosyasını import etmez.

## Komutlar

Java 25 gerekir: `export JAVA_HOME=/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home`

- Backend test: `cd backend && ./mvnw test`
- Backend çalıştır: `cd backend && ./mvnw spring-boot:run` → http://localhost:8081 (`PORT` ile değişir)
- Frontend test: `npm --prefix frontend test`
- Frontend build: `npm --prefix frontend run build` (tip kontrolü dahil)
- Frontend çalıştır: `npm --prefix frontend run dev` → http://localhost:5174, `/api` backend'e proxy edilir

Portlar life-planner (8080, 5173) ile çakışmasın diye 8081 ve 5174.

## Çalışma kuralları

- **Önce sor:** Yeni ekran, tasarım ve kapsam kararlarında önce seçenekleri sun, sonra kodla. Backlog'da `[insan]` işaretli işleri kodlama, `docs/SORULAR.md`'ye yaz.
- **Test kapısı:** Her değişiklik testler geçmeden commit edilmez.
- **Dal:** Otomatik işler `auto/<görev-no>` dalında çalışır, `main`'e insan onayıyla birleşir.
- **Sır yok:** API anahtarları yalnızca ortam değişkenlerinde. Depoya, loglara ve testlere girmez.
- **Üretici soyutlaması:** Harici AI servisleri her zaman `SceneGenerator`, `PromptComposer` gibi arayüzlerin arkasında. Testler gerçek servisi çağırmaz.
- **Dil:** Kod ve değişken adları İngilizce, dokümantasyon ve commit mesajları Türkçe.
