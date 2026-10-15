---
name: dogrulama
description: Bir değişikliğin test kapısından geçip geçmediğini doğrulamak (backend testi, frontend build ve testi) için kullan.
---

# Doğrulama kapısı

Mevcut olan her kapıyı çalıştır, biri başarısızsa dur ve çıktıyı raporla.
Backend için `JAVA_HOME` Java 25'i göstermeli (yol `CLAUDE.md`'de).

1. Backend: `./mvnw test` (`pom.xml` varsa)
2. Frontend build: `npm --prefix web run build` (`web/package.json` varsa)
3. Frontend test: `npm --prefix web test` (`web/package.json` varsa)

## Rapor

- Her kapı için geçti/kaldı.
- Kaldıysa: başarısız testin adı ve ilk hata satırı. Tüm logu yapıştırma.
- "Geçti" demeden önce komutun çıkış kodunu kontrol et.
