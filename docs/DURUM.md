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
- **API sözleşmesi:** Elle yazılan `docs/API.md` (karar #14). Yıl negatifse MÖ, yıl 0 yoktur.
- **Zaman çizgisi:** Yatay, kaydırılıp yakınlaştırılan, doğrusal olmayan ölçekli çizgi (karar #15). MÖ/MS gösterimi tek yardımcıdan (`frontend/src/lib/year.ts`).
- **Konum seçici:** Düz harita, MapLibre GL JS (karar #16). Geliştirmede anahtarsız demo karolar; üretim karo sağlayıcısı açık karar (#20).
- **Servis seçimi:** Panorama ve derinlik servislerini ajan araştırır, karşılaştırmayı #17'ye yazar, sahibi kısa listeden seçer (karar #17).

## Orkestrasyon kararları

- **Merkez GitHub:** Issue = görev, PR = onay kapısı, CI = test kapısı. Telefondan da bilgisayardan da aynı yerden yönetilir, kod her durumda aynı depoya gider.
- **Depo:** `batuhanakdeniz/time-portal`, private.
- **Yürütücü:** Claude Code routines (bulut). Zamanlı ve/veya GitHub olayıyla tetiklenir. Kurulum #13'te.
- **Kapılar:** CI yeşil + reviewer ajan + sahibinin birleştirmesi. Ajan `main`'e doğrudan yazmaz.
- **Korunan yollar:** `.github/`, `.claude/`, `CLAUDE.md` (CODEOWNERS).
- **Pano:** Claude artifact panosu emekli edildi, tek doğru kaynak GitHub.
- **Dış girdi:** Ajan yalnızca sahibinin açtığı issue'lardan tetiklenir.

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

Cevaplar GitHub'da, `karar` etiketli issue'larda: `gh issue list --label karar`

1. Panorama ve derinlik servisi: #17 (araştırma sürüyor, sonra kısa listeden seçim)
2. Üretim harita karo sağlayıcısı: #20
3. Verilenler: API sözleşmesi #14, zaman çizgisi #15, konum seçici #16 (yukarıdaki Kararlar bölümünde)
4. Henüz issue'su olmayanlar: barındırma ve yapıt depolama, kimlik doğrulama gerekecek mi, tarihsel doğruluk uyarısı metni, kota eşikleri (#11), moderasyon yaklaşımı (#12).

## Riskler

- Üretim gecikmesi ve maliyeti. Önbellek ve kota şart.
- Panorama dikişi ve kutup bölgelerinde bozulma. Derinlik kalitesi değişken.
- Kötüye kullanım (zararlı istem, maliyet saldırısı). Hız sınırı ve moderasyon.
- API anahtarları. Yalnızca ortam değişkenlerinde, depoya asla girmez.

## Sıradaki adım

Güncel durum her zaman GitHub'da: `gh issue list --label P0-şimdi`, `gh pr list`.

1. #6 (zaman çizgisi) ve #7 (konum seçici) paralel worktree'lerde geliştiriliyor; #17 araştırması sürüyor.
2. Bileşenler birleşince ayrı bir entegrasyon görevi `App.tsx`'te zaman çizgisi + konum seçici + `POST /api/scenes` akışını bağlar.
3. #4 (360° görüntüleyici) sıradaki P1 işi.
4. Sahibi: #13 kurulumu (GitHub App, routine).
