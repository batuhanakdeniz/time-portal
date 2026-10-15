---
paths:
  - "web/src/**"
---

# Frontend kuralları (React, TypeScript, Three.js)

- Three.js sahnesi bir React bileşeninin içinde yaşar (react-three-fiber). Sahne mantığı (kamera sınırları, hareket) saf fonksiyonlara çıkarılır ve birim testlenir.
- Kamera hareketi **her zaman** sınırlıdır: sınır yarıçapı sabittir ve test edilir. Sınır dışına çıkış mümkün olmamalı.
- Dikey bakış açısı sınırlıdır, yatay 360° serbesttir.
- Büyük dokuları (panorama, derinlik) yükleme durumu ve hata durumu ile göster. Boş ekran bırakma.
- Mobilde dokunmayla kontrol çalışmalı. Performans için doku boyutunu cihaza göre sınırla.
- Yıl gösteriminde MÖ/MS biçimi tek bir yardımcı fonksiyondan gelir.
