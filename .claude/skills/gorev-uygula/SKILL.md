---
name: gorev-uygula
description: docs/BACKLOG.md içinden sıradaki `todo` ve [oto] işaretli görevi seçip uygulamak, doğrulamak ve commit etmek istendiğinde kullan.
---

# Görev uygula

## Adımlar

1. `docs/DURUM.md` ve `CLAUDE.md` dosyalarını oku.
2. `docs/BACKLOG.md` içinde ilk `todo` durumundaki **[oto]** görevi seç. **[insan]** görevlere dokunma.
3. Görev belirsizse (kabul kriteri eksik, tasarım kararı gerekiyor): kodlama. `docs/SORULAR.md`'ye soruyu ve seçenekleri yaz, görevi `blocked` yap, dur.
4. `auto/<görev-no>` dalı aç. Görevi `doing` yap.
5. Önce başarısız bir test yaz, sonra uygula. Yalnızca görevin kapsamını değiştir.
6. `dogrulama` skill'ini çalıştır. Başarısızsa en fazla bir kez düzeltmeyi dene.
7. Hâlâ başarısızsa: değişiklikleri geri al, görevi `blocked` yap, sebebini `docs/SORULAR.md`'ye yaz.
8. Başarılıysa görevi `done` yap, Türkçe bir commit mesajıyla commit et.

## Yapma

- `main`'e push etme.
- API anahtarı, kişisel veri ya da gerçek servis çağrısı ekleme.
- Backlog dışına çıkıp "iyileştirme" yapma. Fark ettiğin işi Backlog'a yeni görev olarak ekle.
