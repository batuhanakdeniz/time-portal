---
paths:
  - "backend/**/*.java"
  - "backend/pom.xml"
---

# Backend kuralları (Spring Boot, Java 25)

- Harici servisler (panorama, derinlik, LLM) arayüz arkasındadır: `SceneGenerator`, `DepthEstimator`, `PromptComposer`. Gerçek adaptör ve sahte (fake) uygulama ayrı sınıflardır.
- Üretim işi asenkrondur. Denetleyici hemen iş kimliğini döner, uzun işi bloklamaz.
- Durum makinesi: `PENDING → RUNNING → READY | FAILED`. Geçişler tek yerde yönetilir.
- Önbellek anahtarı: yaklaşık konum hücresi + tarih dilimi. Anahtar üretimi saf fonksiyon ve birim testlidir.
- Yıl negatif olabilir (MÖ). `LocalDate` yerine yıl-esaslı tarih modeli kullan, sınırlarını test et.
- Testler gerçek ağ çağrısı yapmaz. API anahtarı yoksa test yine geçer.
