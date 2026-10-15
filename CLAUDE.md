# Time Portal

Zaman çizgisinden tarih + dünya üzerinden konum seç → yapay zekayla üretilmiş, 360° dönülebilen ve küçük alanda gezilebilen 3D sahne.
Kararlar ve mimari: `docs/DURUM.md`. Görevler: GitHub Issues (`gh issue list`). Depo: `batuhanakdeniz/time-portal` (private).

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

Portlar life-planner (8080, 5173) ile çakışmasın diye 8081 ve 5174. CI aynı komutları GitHub'da çalıştırır (`.github/workflows/ci.yml`).

## İş akışı (GitHub merkezli)

Tek doğru kaynak GitHub'dır. Sohbet, pano ya da yerel dosya durum tutmaz.

1. **Issue = görev.** Etiketler: `oto` (ajan alır), `insan` (karar/anahtar/tasarım gerekir), `karar` (sahibinin cevabı bekleniyor), `engelli` (ajan takıldı).
2. **Karar = `karar` etiketli issue.** Sahibi issue'ya "A" / "B" yazarak yanıtlar (telefondan da). Cevap gelmeden o karara bağlı iş başlamaz.
3. **Ajan yalnızca `oto` etiketli, açık ve bağımlılıkları kapanmış issue'yu alır**, ve yalnızca sahibinin açtığı issue'ları.
4. **Ajan `main`'e doğrudan push etmez.** `auto/<issue-no>-<kısa-ad>` dalı açar, taslak PR'a `Closes #N` yazar.
5. **PR'ı CI ve reviewer ajan inceler**, sahibi birleştirir. Birleştirme her zaman sahibine aittir.
6. **Sıradaki iş** ancak PR birleştikten sonra başlar.

## Çalışma kuralları

- **Önce sor:** Yeni ekran, tasarım ve kapsam kararlarını kendin verme. `karar` issue'su aç, seçenekleri ve önerini yaz, dur. `insan` etiketli işleri kodlama.
- **Test kapısı:** Testler geçmeden PR "hazır" olarak işaretlenmez. CI kırmızıysa birleştirme önerme.
- **Korunan yollar:** `.github/`, `.claude/` ve `CLAUDE.md` değişiklikleri ajan tarafından kendi kendine yapılmaz. Gerekirse issue aç ve sahibine sor.
- **Sır yok:** API anahtarları yalnızca ortam değişkenlerinde / Actions secrets'ında. Depoya, loglara ve testlere girmez.
- **Üretici soyutlaması:** Harici AI servisleri her zaman `SceneGenerator`, `PromptComposer` gibi arayüzlerin arkasında. Testler gerçek servisi çağırmaz.
- **Sınır:** Görev başına tek düzeltme denemesi. Olmuyorsa değişikliği bırak, issue'ya sebebi yaz, `engelli` etiketi ekle.
- **Dil:** Kod ve değişken adları İngilizce, dokümantasyon ve commit mesajları Türkçe.
