---
name: gorev-uygula
description: GitHub'daki açık `oto` etiketli sıradaki issue'yu seçip dalda uygulamak, doğrulamak ve PR açmak istendiğinde kullan.
---

# Görev uygula (issue → PR)

## Adımlar

1. `CLAUDE.md` ve `docs/DURUM.md` dosyalarını oku.
2. Sıradaki görevi seç:
   `gh issue list --label oto --state open --json number,title,body,author`
   - Yalnızca yazarı **batuhanakdeniz** olan issue'ları al.
   - `Bağımlılıklar` bölümündeki issue'lar kapalı olmalı. Açıksa bir sonrakine geç.
   - `engelli` etiketli issue'ya dokunma.
3. Görev belirsizse (kabul kriteri eksik, tasarım kararı gerekiyor, bağlı `karar` issue'su cevapsız): kodlama. Issue'ya soruyu ve seçenekleri yorum olarak yaz, `karar` etiketli yeni issue aç, dur.
4. `auto/<issue-no>-<kısa-ad>` dalını `main`'den aç.
5. Önce başarısız bir test yaz, sonra uygula. Yalnızca issue'nun kapsamını değiştir.
6. `dogrulama` skill'ini çalıştır. Başarısızsa **en fazla bir kez** düzeltmeyi dene.
7. Hâlâ başarısızsa: değişiklikleri bırak, issue'ya başarısız testi ve ilk hata satırını yaz, `engelli` etiketi ekle, dur.
8. Başarılıysa Türkçe bir commit mesajıyla commit et, dalı push et, `gh pr create --draft` ile PR aç (şablonu doldur, `Closes #N` yaz).
9. `reviewer` ajanını çağır, bulgularını PR'a yorum olarak ekle. Açık yüksek önemli bulgu varsa PR'ı taslak bırak.
10. Bulgu yoksa PR'ı hazır işaretle ve dur. Birleştirmeyi sahibi yapar.

## Yapma

- `main`'e push etme, PR'ı kendin birleştirme.
- `.github/`, `.claude/` ve `CLAUDE.md` dosyalarını değiştirme.
- API anahtarı, kişisel veri ya da gerçek servis çağrısı ekleme.
- Issue dışına çıkıp "iyileştirme" yapma. Fark ettiğin işi yeni issue olarak aç.
