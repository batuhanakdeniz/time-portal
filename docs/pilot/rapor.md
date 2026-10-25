# Üretim pilotu raporu (#67)

Tarih: 25.10.2026 · Makine: Mac mini, Apple M2, 8 GB birleşik bellek, 10 çekirdekli GPU (MLX/Metal) ·
Kararlar: 5A (karma yol), 6A (20 sahnelik pilot) · Araştırma: `docs/arastirma/faz2-arastirma-raporu.md` bölüm B.

Betikler `backend/tools/pilot/` altında. Model ağırlıkları `~/.cache/time-portal/pilot/`, üretilen görseller
`~/time-portal-pilot/` altında (depo dışı). Depoda yalnızca küçültülmüş örnekler var (`docs/pilot/img/`).

İşaretler: **[Ölçüm]** bu pilotta ölçüldü · **[Tahmin]** hesap ya da çıkarım · **[Gözlem]** görsel değerlendirme.

---

## Adım 0: kurulum ve ilk ölçüm

### Kurulum

| Adım | Not |
|---|---|
| Python | Sistemdeki Homebrew Python 3.15'te `mflux` kurulamıyor (bağımlılıklardan birinin 3.15 tekerleği yok, pip çözümleyici `ResolutionImpossible`). `uv` ile depo dışına (`~/.cache/time-portal/pilot/python`) Python 3.12.15 kuruldu; venv `backend/tools/pilot/.venv` (gitignore'da). |
| Pillow | `mflux` en yeni Pillow 13'ü çekiyor; Pillow 13, Python 3.12.15'te `numbers._IntegralLike` içe aktarma hatası veriyor. `pillow>=12.3,<13` sabitlendi. |
| Paketler | `mflux 0.23.0` (MIT), `mlx 0.32.4`, `onnxruntime 1.31.0`, `pytest`. Liste: `backend/tools/pilot/requirements.txt`. |
| Modeller | `setup_models.sh`: `mflux-save --quantize 4` ile klein **base** 4B ve klein 4B (damıtılmış) 4-bit kopyaları, her biri 4,3 GB. İndirme + dönüştürme base için 34 dk (çoğu indirme), damıtılmış için 3 dk (metin kodlayıcı ortak); tepe bellek 5,85 GB [Ölçüm]. Ham bf16 indirme önbelleği 22 GB (silinebilir). |
| LoRA | `nomadoor/flux-2-klein-4B-360-erp-outpaint-lora` (commit `124129f`), `hf_hub_download` ile önbelleğe. |

### İlk görüntü ve ayarlama (1024×512, Trabzon × Roma)

LoRA bir "düzenleme" LoRA'sı: 2:1 yeşil (#00ff00) kontrol görüntüsünde yeşil alanları 360° olarak dolduruyor.
Pilotta kontrol tamamen yeşil (yalnızca metinden 360°). LoRA kartının iş akışı: **base** model, 20 adım, CFG 5,
LoRA 0,9. Süre ve bellek `/usr/bin/time -l` ile (bellek: "peak memory footprint"; MLX belleği `ru_maxrss`'e
yansımıyor, o yüzden kullanılmadı).

| # | Ayar | Süre | Adım başına | Tepe bellek | Dikiş oranı | Dikiş sırası |
|---|---|---|---|---|---|---|
| 1 | base + LoRA (gömülü), 20 adım, CFG 5 | 852 s | 42 s | **9,75 GB** (takas) | 4,60 ✗ | 1,00 ✗ |
| 2 | + fp16 hesap, metin kodlayıcı serbest, MLX önbellek 1 GB (4 adımlık hız denemesi) | 127 s | 31 s | 6,43 GB | — | — |
| 3 | + yarım boy kontrol (512×256), gizli değişken döndürme, 20 adım | 424 s | 21 s | 6,40 GB | 2,19 ✗ | 1,00 ✗ |
| 4 | **damıtılmış** klein 4B + LoRA, 4 adım, CFG yok, + sarmalı dolgulu VAE çözme | **46 s** | 11 s | 6,87 GB | **0,42 ✓** | 0,05 ✓ |
| 5 | 4 numara, **2048×1024** | 224 s | 44 s | 9,78 GB (takas) | 1,32 ✓ | 0,98 |

[Ölçüm, hepsi]. Bulgular:

- **8 GB'ta sığıyor**, ama 2048×1024'te ve ilk ayarda tepe bellek fiziksel belleği aşıyor (takas). Uygulama
  sunucuları (8081, 5174) açıkken ölçüldü.
- En büyük hız kazançları: `compute_precision=float16` (M2'de bf16 yavaş), metin kodlayıcıyı tarifler kodlandıktan
  sonra bellekten atmak (Qwen3 4B, ~2,2 GB), referans (kontrol) görüntüsünü yarım boy vermek (jeton sayısı ¼).
- **Base model (LoRA kartının önerisi) 1024×512'de bile sahne başına 7 dk**; 2048×1024'te ~30 dk+ [Tahmin].
  Damıtılmış model kartın uyarısına ("çoğu durumda iyi sonuç vermez") rağmen bu pilotta **daha temiz** sonuç verdi
  (bkz. Adım 2) ve 2048×1024'te sahne başına 3,7 dk.
- LoRA'yı 4-bit katmanlara "gömmek" (varsayılan) güncellemenin yalnızca %73'ünü koruyor (mflux uyarısı);
  `--no-bake` ile tamamı uygulanıyor, hız farkı ölçülemeyecek kadar küçük.
- 20 adım + CFG ile denenen base modelde sağ–sol kenar kopuk kaldı (dikiş oranı > 2). İki düzeltme eklendi:
  1. **Gizli değişken döndürme** (her adımdan sonra yatay `roll`, çözmeden önce geri alınır): tek başına yetmedi.
  2. **Sarmalı dolgulu VAE çözme**: gizli değişken iki yandan 4 sütun (64 px) sarmalı dolguyla çözülüp kırpılıyor.
     Asıl kopukluk VAE çözücüsünün sıfır dolgusundan geliyormuş; bu düzeltmeden sonra dikiş oranı 0,4–1,3.

### Dikiş ölçütü

`depthmath.seam_ratio` backend'deki `DepthMath.seamRatio` ile birebir aynı (sol/sağ kenar sütun farkı ortalaması /
iç komşu sütun farkı ortalaması, kabul ≤ 2). Pilotta bir zayıflığı görüldü: oran tek bir ortalamaya bölündüğü için
keskin ayrıntılı ama **kusursuz sürekli** bir görüntüde de 2'yi aşabiliyor (ışın izlenmiş Beyoğlu arazi derinliğinde
oran 5,07; iç sütun çiftlerinin %1'i zaten 10'un üstünde). Bu yüzden ikinci bir ölçüt eklendi:
**`seam_rank`** = dikiş farkının, aynı görüntünün iç komşu sütun çiftleri arasındaki yüzdelik sırası. Sürekli
dikişte tipik bir değer, kopuk dikişte ~1. `pole_ratio` = üst/alt %3 şeritteki yatay komşu farkı / tüm görüntününki
(ERP'de kutup satırı tek nokta; küçük = temiz). Testler: `backend/tools/pilot/tests/` (`pytest`, sentetik veri).
