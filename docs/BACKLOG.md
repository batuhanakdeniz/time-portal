# Görev kuyruğu

Görevler **GitHub Issues**'ta: https://github.com/batuhanakdeniz/time-portal/issues

Bu dosya yalnızca yön gösterir, durum ve öncelik issue etiketlerinde tutulur (iki yerde tutulan durum sapar).

```bash
gh issue list --label P0-şimdi   # önce yapılacaklar
gh issue list --label oto        # ajanın alabileceği işler
gh issue list --label karar      # senden bekleyen kararlar
gh issue list --label engelli    # ajanın takıldığı işler
```

## Fazlar (18.10.2026, #26)

Faz etiketleri `F1`–`F5`. Eski `faz-2` / `faz-3` yalnızca kapanmış işlerde. Bir faz içinde sıra öncelik etiketine göredir (`P0` → `P3`).

```bash
gh issue list --label F1-türkiye-2026   # şu anki faz
```

| Faz | Kapsam | Issue'lar |
|---|---|---|
| **F1 Türkiye 2026** | Yıl seç → Türkiye'de konum → sahne oluştur → (şimdilik 2026) → şehir → şehir merkezi görseli → 3B | #37 karar, #38 harita, #39 şehir bulma, #40 görsel bulma, #41 3B üretici, #42 API + arayüz |
| **F2 Deneyim** | Görüntüleyici ve arayüz iyileştirmeleri | #5 derinlikli hareket, #27 OpenFreeMap, #33 503 mesajı |
| **F3 Zaman** | Seçilen yılın yorumu, kendi üreticimiz | #26, #36 |
| **F4 Dünya** | Türkiye dışına genişleme | #34 |
| **F5 Yayın** | Kota, içerik güvenliği, barındırma | #11, #12 |
| Altyapı | Orkestrasyon | #13 |

Kapalı (eski fazlar): #1–#4, #6, #7, #9, #10, #19, #24 ve kararlar #14–#17, #20. #8'in yerini #41 aldı.
