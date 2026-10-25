# Time Portal — durum ve kararlar

Yeni bir oturumda bu dosyayı önce oku. Çalışma kuralları için `CLAUDE.md`, görevler için `docs/BACKLOG.md`.

## Amaç

Kullanıcı siteye girince bir **zaman çizgisi** görür ve bir tarih seçer. Ardından dünya üzerinde bir **konum** seçer. Seçilen konum ve tarih için yapay zekayla **3 boyutlu bir görsel** üretilir. Kullanıcı bu görselde 360° dönebilir ve küçük bir alanda ileri-geri hareket edebilir.

## Güncel kapsam (18.10.2026, #26)

İlk ürün **yalnızca Türkiye** ve **2026 görünümü** ile çalışır:

1. Kullanıcı yıl seçer (şimdilik üretimi etkilemez, sonuçta "2026 görünümü" notu gösterilir).
2. Haritadan Türkiye'de bir konum seçer.
3. "Sahne oluştur"a tıklar.
4. Konumun ait olduğu şehir bulunur.
5. O şehrin merkezine ait açık lisanslı bir görsel bulunur.
6. Görsel derinlik tahminiyle 3B'ye çevrilir.

Karar #37 (**1B 2A 3D 4C 5A**): ilçe düzeyi (~970 ilçe), ilçe sınırları depoda (çevrimdışı), görsel Mapillary 360° → Wikimedia Commons (ücretsiz Mapillary anahtarı #44), panorama varsa 360°, yoksa 2.5B fotoğraf (#45), derinlik backend'de ONNX Runtime + Depth Anything V2 Small. Fazlar: `docs/BACKLOG.md`. Seçilen yılın yorumu Faz 2 araştırmasıyla (#55) yönlendirilecek.

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
- **Konum seçici:** Düz harita, MapLibre GL JS (karar #16). Karolar: karar #20 OpenFreeMap idi; Faz 2 araştırması (#54) altlıksız (karo yok) haritayı öneriyor, karar #57'de. OpenStreetMap/ODbL atfı her durumda görünür olmalı.
- **Ücretli servis yok (karar #17):** Panorama, derinlik ve sahne tarifi için ücretli API kullanılmaz. Gerçek üretici Faz 1'de yazıldı (#41: ilçe görseli + ONNX derinlik). Dönem sahneleri için yöntem araştırması #55'te, karar #57'de. Sahne tarifi kural tabanlı (`RuleBasedPromptComposer`, #9); LLM ileride aynı arayüzün arkasına takılabilir.
- **Önbellek konumu:** Üreticinin önünde sarmalayıcı (`CachingSceneGenerator`, #10); iş servisi değişmez.

## Orkestrasyon kararları

- **Merkez GitHub:** Issue = görev, PR = onay kapısı, CI = test kapısı. Telefondan da bilgisayardan da aynı yerden yönetilir, kod her durumda aynı depoya gider.
- **Depo:** `batuhanakdeniz/time-portal`, private.
- **Yürütücü:** Claude Code routine "time-portal: sıradaki oto issue", her gün 09:00 İstanbul, Mac mini ortamında (Mac kapalıysa çalışmaz). Her çalışmada tek `oto` issue alır ve taslak PR açar (#13).
- **Kapılar:** CI yeşil + reviewer ajan + sahibinin birleştirmesi. Ajan `main`'e doğrudan yazmaz. `main` koruması kural düzeyinde (karar #13 C: ücretsiz planda private depoda teknik koruma yok).
- **Korunan yollar:** `.github/`, `.claude/`, `CLAUDE.md` (CODEOWNERS).
- **Pano:** Claude artifact panosu emekli edildi, tek doğru kaynak GitHub.
- **Dış girdi:** Ajan yalnızca sahibinin açtığı issue'lardan tetiklenir.

## Boru hattı

Faz 1 (karar #37):

```
konum (Türkiye)
  → DistrictLocator: ilçe + il (#39)
  → CityImageFinder: ilçe merkezi görseli + atıf (#40; Mapillary 360° → Commons)
  → DepthEstimator: derinlik haritası, açık = yakın (#41)
  → sonuç: görsel, derinlik, tür, ilçe/il, atıf (#42)
  → viewer: 360° bakış (panorama) ya da 2.5B (fotoğraf, #45)
```

Faz 3 ve sonrası (hedef):

```
tarih + konum
  → bağlam (ters coğrafi kodlama, dönem bilgisi)
  → PromptComposer (şimdilik kural tabanlı): sahne tarifi
  → SceneGenerator: panorama
  → DepthEstimator: derinlik haritası
  → artefaktlar: pano.jpg, depth.png, meta.json
  → viewer: 360° bakış + sınırlı hareket
```

## Açık kararlar (insan kararı gerekir)

Cevaplar GitHub'da, `karar` etiketli issue'larda: `gh issue list --label karar`

1. Verilenler: API sözleşmesi #14, zaman çizgisi #15, konum seçici #16, ücretli servis yok #17, OpenFreeMap #20 (yukarıdaki Kararlar bölümünde)
2. Dönem sahnesi üretim yolu, harita yaklaşımı ve çok sayfalı akış: #57 (rapor: `docs/arastirma/faz2-arastirma-raporu.md`)
3. Henüz issue'su olmayanlar: barındırma ve yapıt depolama, kimlik doğrulama gerekecek mi, tarihsel doğruluk uyarısı metni, kota eşikleri (#11), moderasyon yaklaşımı (#12).

## Riskler

- Üretim gecikmesi ve maliyeti. Önbellek ve kota şart.
- Panorama dikişi ve kutup bölgelerinde bozulma. Derinlik kalitesi değişken.
- Kötüye kullanım (zararlı istem, maliyet saldırısı). Hız sınırı ve moderasyon.
- API anahtarları. Yalnızca ortam değişkenlerinde, depoya asla girmez.

## Sıradaki adım

Güncel durum her zaman GitHub'da: `gh issue list --label karar`, `gh issue list --label F3-akış`, `gh pr list`.

**Faz 1 tamamlandı (25.10.2026).** Akış uçtan uca çalışıyor: Türkiye'de konum → ilçe → ilçe merkezi görseli (Mapillary 360° ya da Commons fotoğrafı) → derinlik → 360° ya da 2.5B görünüm; ilçe/il, "2026 görünümü" notu, atıf ve Türkçe hatalar ekranda.

**Faz 2 (araştırma) raporu hazır:** `docs/arastirma/faz2-arastirma-raporu.md`. Özet: harita için altlıksız MapLibre (prototip çalıştı); sahne üretimi için dönem kovaları × il, çevrimdışı yerel üretim + gerçek arazi, canlıda API yok; akış için üç sayfa ve "höyük kesiti" yıl ekranı. 8 karar #57'de.

**Faz 3 (akış)** #57 cevaplanınca açılır: yönlendirme + 3 sayfa iskeleti → altlıksız harita → yıl ekranı → tam ekran sahne + yükleme (`stage` alanı) → üretim pilotu (20 sahne) → ikinci karar turu → toplu üretim.

Orkestrasyon: routine durduruldu (#13 sonrası karar C); işler orkestratör oturumundan elle yürütülüyor. Bulut ortamına geçiş Faz 3'te değerlendirilecek.

Yerelde gerçek üretici: `timeportal.generator=city-image` (varsayılan), Mapillary için `MAPILLARY_TOKEN` ortam değişkeni. Model ilk istekte indirilir (`backend/MODELS.md`). Testler ve CI `fake` kullanır.

Açık sahip kararları: #57 (Faz 3 yönü), Mapillary logosu (şartlar md. 11; şimdilik yalnızca metin bağlantısı), yayın öncesi kota/içerik güvenliği (#56'da not).
