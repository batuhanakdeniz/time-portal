# Görev kuyruğu

Görevler **GitHub Issues**'ta: https://github.com/batuhanakdeniz/time-portal/issues

Bu dosya yalnızca yön gösterir, durum ve öncelik issue etiketlerinde tutulur (iki yerde tutulan durum sapar).

```bash
gh issue list --label P0-şimdi   # önce yapılacaklar
gh issue list --label oto        # ajanın alabileceği işler
gh issue list --label karar      # senden bekleyen kararlar
gh issue list --label engelli    # ajanın takıldığı işler
```

## Fazlar (25.10.2026)

Faz etiketleri `F1`–`F5`. Bir faz içinde sıra öncelik etiketine göredir (`P0` → `P3`).

```bash
gh issue list --label F2-araştırma   # şu anki faz
gh issue list --label karar          # senden bekleyen kararlar
```

| Faz | Kapsam | Issue'lar |
|---|---|---|
| **F1 Türkiye 2026** (tamamlandı) | Yıl seç → Türkiye'de konum → ilçe → ilçe merkezi görseli → derinlik → 360° / 2.5B | #37–#42, #44, #45, #49 (kapalı) |
| **F2 Araştırma** | Harita (MapLibre mi?), sahne üretim yöntemi (API'siz), çok sayfalı akış tasarımı. Rapor: `docs/arastirma/faz2-arastirma-raporu.md` | #54, #55, #56; karar #57 |
| **F3 Akış** | Çok sayfalı akış: 1) yıl seçimi (animasyonlu), 2) harita (il/ilçe, sınırlar, vurgu), 3) tam ekran 3B sahne. Sözleşme `docs/FAZ3.md` | Bitti: #58–#66, #63. Kalan: #67 pilot, #77, #78 |
| **F4 Dünya** | Türkiye dışına genişleme | sonra |
| **F5 Yayın** | Kota, içerik güvenliği, barındırma | sonra |

Eski F2/F3 issue'ları (#5, #11, #12, #26, #27, #33, #34, #36, #53) 25.10.2026'da silindi; içerikleri #54–#56'ya taşındı. Kapalı: #1–#4, #6–#10, #13, #19, #24 ve kararlar #14–#17, #20, #37.
