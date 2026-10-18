package com.timeportal.depth;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Derinlik modelinin yerel önbelleği. Dosya yoksa (ya da sağlama toplamı tutmuyorsa) ilk ihtiyaçta
 * indirilir: geçici dosyaya indir → SHA-256 doğrula → atomik taşı. Eşzamanlı çağrılar tek indirmeye
 * katılır (kilit). Başarısızlık önbelleğe alınmaz, sonraki çağrı yeniden dener. Kaynak, sürüm ve
 * lisans {@code backend/MODELS.md}'dedir.
 */
public class DepthModelStore {

	/** Hugging Face {@code onnx-community/depth-anything-v2-small} (Apache-2.0), sabit commit. */
	public static final String DEFAULT_URL = "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/"
			+ "4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model.onnx";
	public static final String DEFAULT_SHA256 = "afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c";
	public static final String FILE_NAME = "depth-anything-v2-small-4472b73.onnx";

	/** URL'den dosyaya indirir; hata durumunda {@link IOException} fırlatır. */
	@FunctionalInterface
	public interface Downloader {
		void download(String url, Path target) throws IOException;
	}

	private static final Logger log = LoggerFactory.getLogger(DepthModelStore.class);

	private final Path modelDir;
	private final String url;
	private final String sha256;
	private final Downloader downloader;
	private final Object lock = new Object();
	private volatile Path verified;

	public DepthModelStore(Path modelDir, Downloader downloader) {
		this(modelDir, DEFAULT_URL, DEFAULT_SHA256, downloader);
	}

	public DepthModelStore(Path modelDir, String url, String sha256, Downloader downloader) {
		this.modelDir = modelDir;
		this.url = url;
		this.sha256 = sha256.toLowerCase(java.util.Locale.ROOT);
		this.downloader = downloader;
	}

	/** Doğrulanmış model dosyasının yolu; gerekirse indirir. */
	public Path ensureModel() throws IOException {
		Path ready = verified;
		if (ready != null && Files.isRegularFile(ready)) {
			return ready;
		}
		synchronized (lock) {
			Path target = modelDir.resolve(FILE_NAME);
			if (Files.isRegularFile(target)) {
				if (sha256.equals(checksum(target))) {
					verified = target;
					return target;
				}
				log.warn("Depth model checksum mismatch at {}; downloading again", target);
			}
			Files.createDirectories(modelDir);
			Path temp = Files.createTempFile(modelDir, FILE_NAME, ".part");
			try {
				log.info("Downloading depth model from {} (first use, about 95 MB)", url);
				downloader.download(url, temp);
				String actual = checksum(temp);
				if (!sha256.equals(actual)) {
					throw new IOException("depth model checksum mismatch: expected " + sha256 + " but got " + actual);
				}
				move(temp, target);
				log.info("Depth model stored at {}", target);
			}
			catch (IOException | RuntimeException e) {
				log.error("Depth model download failed: {}", e.getMessage());
				throw e;
			}
			finally {
				Files.deleteIfExists(temp);
			}
			verified = target;
			return target;
		}
	}

	private static void move(Path from, Path to) throws IOException {
		try {
			Files.move(from, to, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
		}
		catch (AtomicMoveNotSupportedException e) {
			Files.move(from, to, StandardCopyOption.REPLACE_EXISTING);
		}
	}

	static String checksum(Path file) throws IOException {
		try (InputStream in = Files.newInputStream(file)) {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] buf = new byte[1 << 16];
			int n;
			while ((n = in.read(buf)) != -1) {
				digest.update(buf, 0, n);
			}
			return HexFormat.of().formatHex(digest.digest());
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
