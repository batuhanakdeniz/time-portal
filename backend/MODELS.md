# Modeller

Model dosyaları depoya girmez. İlk ihtiyaçta indirilir ve yerel önbelleğe alınır.

## Derinlik: Depth Anything V2 Small (ONNX)

| Alan | Değer |
|---|---|
| Kaynak | Hugging Face `onnx-community/depth-anything-v2-small`, dosya `onnx/model.onnx` (fp32) |
| Sürüm (commit) | `4472b7362082ad9968fee890ca0f1e5aca36b93d` |
| Adres | `https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model.onnx` |
| Boyut | 99.060.839 bayt (~95 MiB) |
| SHA-256 | `afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c` (Hugging Face LFS özetiyle aynı) |
| Lisans | Apache-2.0 (model kartı ve temel model `depth-anything/Depth-Anything-V2-Small`). Base/Large/Giant ticari kullanıma kapalıdır, **kullanılmaz**. |
| Girdi / çıktı | `pixel_values` `[N,3,H,W]` float32 (H, W 14'ün katı, dinamik); `predicted_depth` `[N,H,W]` göreli **ters derinlik** (büyük = yakın) |

Kod: `com.timeportal.depth.DepthModelStore` (adres ve özet sabitleri orada). Dosya `timeportal.depth.model-dir`
altına (varsayılan `${user.home}/.cache/time-portal/models`) `depth-anything-v2-small-4472b73.onnx` adıyla iner:
geçici dosyaya indir, SHA-256 doğrula, atomik taşı. Eşzamanlı ilk isteklerde tek indirme yapılır; özet tutmazsa
dosya silinir ve iş `generation failed` ile FAILED olur (sonraki istek yeniden dener).

## ONNX Runtime

`com.microsoft.onnxruntime:onnxruntime:1.31.0` (MIT). Jar içinde `osx-aarch64`, `linux-x64`, `linux-aarch64` ve
`win-x64` native kütüphaneleri var (macOS arm64 doğrulandı). Native kütüphane yalnızca ilk çıkarımda yüklenir:
testlerde ve `timeportal.generator=fake` iken hiç yüklenmez.

Java 25 ilk native yüklemede "restricted method" uyarısı basar (zararsız; ileride engellenecek). Kapatmak için
JVM'e `--enable-native-access=ALL-UNNAMED` ver (ör. `JAVA_TOOL_OPTIONS=--enable-native-access=ALL-UNNAMED`
ya da `./mvnw spring-boot:run -Dspring-boot.run.jvmArguments=--enable-native-access=ALL-UNNAMED`).

## Ayarlar

| Özellik | Varsayılan | Anlamı |
|---|---|---|
| `timeportal.generator` | `city-image` | `city-image` gerçek üretici, `fake` örnek yapıtlar (testlerde `fake`) |
| `timeportal.depth.model-dir` | `${user.home}/.cache/time-portal/models` | model önbelleği |
| `timeportal.depth.max-concurrent` | `1` | eşzamanlı çıkarım sınırı (CPU) |
| `timeportal.artifacts-dir` | `./data/artifacts` | indirilen görsel ve derinlik PNG'leri |
| `timeportal.artifacts.max-files` / `max-bytes` | `2000` / 2 GiB | aşılırsa en eski dosyalar silinir |
| `timeportal.scene.district-ttl` / `degraded-ttl` | `PT24H` / `PT5M` | ilçe önbelleği süresi (geçici hatalı aramada kısa) |
