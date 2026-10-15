---
name: dogrulama
description: Bir değişikliğin test kapısından geçip geçmediğini doğrulamak (backend testi, frontend build ve testi) için kullan.
---

# Doğrulama kapısı

Mevcut olan her kapıyı çalıştır, biri başarısızsa dur ve çıktıyı raporla.
Backend için `JAVA_HOME` Java 25'i göstermeli (yol `CLAUDE.md`'de).

1. Backend: `cd backend && ./mvnw test` (`backend/pom.xml` varsa)
2. Frontend build: `npm --prefix frontend run build` (`frontend/package.json` varsa)
3. Frontend test: `npm --prefix frontend test` (`frontend/package.json` varsa)

## Rapor

- Her kapı için geçti/kaldı.
- Kaldıysa: başarısız testin adı ve ilk hata satırı. Tüm logu yapıştırma.
- "Geçti" demeden önce komutun çıkış kodunu kontrol et.
