# Görev kuyruğu

Görevler **GitHub Issues**'ta: https://github.com/batuhanakdeniz/time-portal/issues

Bu dosya yalnızca yön gösterir, durum ve öncelik issue etiketlerinde tutulur (iki yerde tutulan durum sapar).

```bash
gh issue list --label P0-şimdi   # önce yapılacaklar
gh issue list --label oto        # ajanın alabileceği işler
gh issue list --label karar      # senden bekleyen kararlar
gh issue list --label engelli    # ajanın takıldığı işler
```

## Öncelik ilkesi

1. **Önce işleri bloklayan ucuz kararlar** (saniyeler alır, ajanı serbest bırakır).
2. **Ana yol:** iş akışı → görüntüleyici → hareket. Ürünün kalbi burada.
3. **En riskli bilinmeyen (servis seçimi) erken karara bağlanır**, uygulaması ana yoldan sonra gelir.
4. **Güvenlik ve kota yayından önce şart**, ama çekirdek çalışmadan yapılmaz.

| Öncelik | # | Görev | Kim |
|---|---|---|---|
| **P0 şimdi** | 14 | Karar: API sözleşmesi | sen |
| | 13 | Routine ve Claude GitHub App kurulumu | sen |
| | 3 | Sahte üretici ve iş akışı | ajan |
| **P1 sıradaki** | 4 | 360° görüntüleyici | ajan |
| | 5 | Derinlikli sınırlı hareket | ajan |
| | 17 | Karar: panorama/derinlik servisi | sen |
| | 15 | Karar: zaman çizgisi tasarımı | sen |
| | 16 | Karar: konum seçici | sen |
| **P2 sonra** | 6 | Zaman çizgisi bileşeni | ajan (karar sonrası) |
| | 7 | Konum seçici | ajan (karar sonrası) |
| | 8 | Gerçek üretici adaptörü | sen + ajan |
| | 9 | PromptComposer | ajan |
| | 10 | Önbellek | ajan |
| **P3 yayın öncesi** | 11 | Hız sınırı ve kota | sen |
| | 12 | İçerik güvenliği | sen |

Kapalı: #1 backend iskeleti, #2 frontend iskeleti.
