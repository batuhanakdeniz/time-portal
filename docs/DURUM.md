# Time Portal — durum ve kararlar

Yeni bir oturumda bu dosyayı önce oku. Çalışma kuralları için `CLAUDE.md`, görevler için `docs/BACKLOG.md`.

## Amaç

Kullanıcı siteye girince bir **zaman çizgisi** görür ve bir tarih seçer. Ardından dünya üzerinde bir **konum** seçer. Seçilen konum ve tarih için yapay zekayla **3 boyutlu bir görsel** üretilir. Kullanıcı bu görselde 360° dönebilir ve küçük bir alanda ileri-geri hareket edebilir.

## Kararlar

- **3D yaklaşım:** Panorama + derinlik. Yapay zekayla 360° (equirectangular) panorama üretilir, derinlik haritası çıkarılır, Three.js'te paralaks/mesh ile gösterilir. Hareket alanı küçüktür (kafa kıpırdatma ölçeğinde).
- **Üretici soyutlaması:** Üretim servisi `SceneGenerator` arayüzünün arkasındadır. Sonradan gerçek 3D sahne servisine (Gaussian splat / dünya modeli) geçmek bir adaptör değişikliği olmalıdır.
- **Tarih aralığı:** Geçmiş + gelecek. Zaman çizgisi doğrusal olmayan ölçek kullanmalı. Yılın negatif olması (MÖ) desteklenmeli.
- **Backend:** Spring Boot (Java 25), life-planner ile aynı yığın.
- **Frontend:** React + Vite + TypeScript, Three.js (react-three-fiber), konum seçimi için harita/küre bileşeni.
- **Üretim akışı asenkron:** İstek bir iş (job) oluşturur, durum sorgulanır, sonuç saklanır. Üretim saniyeler-dakikalar sürebilir.
- **Önbellek:** Aynı (yaklaşık konum hücresi, tarih dilimi) için sonuç yeniden üretilmez.

## Boru hattı

```
tarih + konum
  → bağlam (ters coğrafi kodlama, dönem bilgisi)
  → PromptComposer (LLM): sahne tarifi
  → SceneGenerator: panorama
  → DepthEstimator: derinlik haritası
  → artefaktlar: pano.jpg, depth.png, meta.json
  → viewer: 360° bakış + sınırlı hareket
```

## Açık kararlar (insan kararı gerekir)

1. Panorama ve derinlik için hangi servis/model? (maliyet, kalite, lisans karşılaştırılmalı)
2. Barındırma ve yapıt depolama (yerel dosya, nesne depolama).
3. Maliyet sınırı: kullanıcı başına/gün üretim kotası.
4. İçerik güvenliği: istem filtreleme ve moderasyon.
5. Tarihsel doğruluk için kullanıcıya gösterilecek uyarı ("yapay zekayla yorumlanmış").
6. Zaman çizgisi ve konum seçim ekranlarının tasarımı (önce sor).
7. Kimlik doğrulama gerekecek mi?

## Riskler

- Üretim gecikmesi ve maliyeti. Önbellek ve kota şart.
- Panorama dikişi ve kutup bölgelerinde bozulma. Derinlik kalitesi değişken.
- Kötüye kullanım (zararlı istem, maliyet saldırısı). Hız sınırı ve moderasyon.
- API anahtarları. Yalnızca ortam değişkenlerinde, depoya asla girmez.

## Sıradaki adım

Faz 2: yürüyen iskelet. `docs/BACKLOG.md` içindeki ilk görevlerden başla.
