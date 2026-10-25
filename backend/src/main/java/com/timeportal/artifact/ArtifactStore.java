package com.timeportal.artifact;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Üretilen görsel ve derinlik PNG'lerinin disk deposu. Görsel adı içerik özetidir:
 * {@code <sha256 ilk 16 hex>.jpg|png}; derinlik adı görsel özeti ve isteğe bağlı bir varyant
 * anahtarından (ör. normalizasyon parametreleri) türetilir: {@code <16 hex>-depth.png}. Adlar yalnızca {@link #NAME}
 * kalıbına uyarsa çözülür, böylece yol gezintisi (path traversal) imkânsızdır. Yazım atomiktir
 * (geçici dosya + taşıma). Disk sınırı: dosya sayısı ve toplam bayt aşılırsa en eski dosyalar
 * (son değiştirilme zamanına göre) silinir.
 */
public class ArtifactStore {

	/** Sunulabilen adların tek geçerli biçimi. */
	public static final Pattern NAME = Pattern.compile("[a-f0-9]{16}(-depth)?\\.(jpg|png)");

	private static final Logger log = LoggerFactory.getLogger(ArtifactStore.class);

	private final Path dir;
	private final int maxFiles;
	private final long maxBytes;
	private final Object lock = new Object();

	public ArtifactStore(Path dir, int maxFiles, long maxBytes) {
		if (maxFiles < 2 || maxBytes < 1) {
			throw new IllegalArgumentException("artifact limits too small");
		}
		this.dir = dir.toAbsolutePath().normalize();
		this.maxFiles = maxFiles;
		this.maxBytes = maxBytes;
		deleteStaleTempFiles();
	}

	/** Çökmüş bir yazımdan kalan {@code tmp-*.part} dosyalarını siler (başlangıçta bir kez). */
	private void deleteStaleTempFiles() {
		if (!Files.isDirectory(dir)) {
			return;
		}
		try (Stream<Path> s = Files.list(dir)) {
			for (Path p : s.filter(p -> {
				String n = p.getFileName().toString();
				return n.startsWith("tmp-") && n.endsWith(".part");
			}).toList()) {
				Files.deleteIfExists(p);
			}
		}
		catch (IOException e) {
			log.warn("Could not clean stale temp files in {}: {}", dir, e.getMessage());
		}
	}

	public static boolean isValidName(String name) {
		return name != null && NAME.matcher(name).matches();
	}

	/** İçerik özetinden 16 haneli ön ek. */
	public static String digestPrefix(byte[] bytes) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).substring(0, 16);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	/** Görseli {@code <özet>.<ext>} adıyla saklar ({@code ext}: jpg ya da png); adı döner. */
	public String saveImage(byte[] bytes, String ext) {
		String name = digestPrefix(bytes) + "." + ext;
		save(name, bytes);
		return name;
	}

	/** Bir görsele ait derinlik PNG'sini {@code <görsel özeti>-depth.png} adıyla saklar; adı döner. */
	public String saveDepth(String imageName, byte[] png) {
		String name = depthName(imageName, null);
		save(name, png);
		return name;
	}

	/**
	 * Derinlik PNG'sini, görsel özeti ve {@code variantKey}'den türetilen adla saklar; adı döner. Yapıtlar
	 * uzun süreli (immutable) önbelleğe alındığından, aynı görselin farklı ayarlarla üretilen derinliği
	 * farklı bir URL almalıdır (#66).
	 */
	public String saveDepth(String imageName, String variantKey, byte[] png) {
		String name = depthName(imageName, variantKey);
		save(name, png);
		return name;
	}

	/**
	 * Derinlik dosya adı: anahtar yoksa {@code <görsel özeti>-depth.png}; varsa
	 * {@code sha256(<görsel özeti> + "|" + anahtar)} ilk 16 hex + {@code -depth.png}. Ad kalıbı
	 * ({@link #NAME}) değişmez.
	 */
	public static String depthName(String imageName, String variantKey) {
		if (!isValidName(imageName)) {
			throw new IllegalArgumentException("invalid image name");
		}
		String imageDigest = imageName.substring(0, 16);
		if (variantKey == null) {
			return imageDigest + "-depth.png";
		}
		return digestPrefix((imageDigest + "|" + variantKey).getBytes(StandardCharsets.UTF_8)) + "-depth.png";
	}

	public boolean exists(String name) {
		return resolve(name).isPresent();
	}

	/** Geçerli adlı ve var olan dosyanın yolu; yoksa ya da ad geçersizse boş. */
	public Optional<Path> resolve(String name) {
		if (!isValidName(name)) {
			return Optional.empty();
		}
		Path file = dir.resolve(name).normalize();
		if (!file.startsWith(dir) || !Files.isRegularFile(file)) {
			return Optional.empty();
		}
		return Optional.of(file);
	}

	private void save(String name, byte[] bytes) {
		synchronized (lock) {
			try {
				Files.createDirectories(dir);
				Path target = dir.resolve(name);
				Path temp = Files.createTempFile(dir, "tmp-", ".part");
				try {
					Files.write(temp, bytes);
					try {
						Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
					}
					catch (AtomicMoveNotSupportedException e) {
						Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
					}
				}
				finally {
					Files.deleteIfExists(temp);
				}
				prune(name);
			}
			catch (IOException e) {
				throw new UncheckedIOException(e);
			}
		}
	}

	/** Sınırı aşan en eski dosyaları siler; az önce yazılan dosya silinmez. */
	private void prune(String keep) throws IOException {
		List<Path> files;
		try (Stream<Path> s = Files.list(dir)) {
			files = s.filter(p -> NAME.matcher(p.getFileName().toString()).matches())
				.sorted(Comparator.comparing(ArtifactStore::modified).thenComparing(Path::getFileName))
				.toList();
		}
		long total = 0;
		for (Path p : files) {
			total += size(p);
		}
		int count = files.size();
		for (Path p : files) {
			if (count <= maxFiles && total <= maxBytes) {
				break;
			}
			if (p.getFileName().toString().equals(keep)) {
				continue;
			}
			long size = size(p);
			if (Files.deleteIfExists(p)) {
				log.info("Artifact limit reached; removed {}", p.getFileName());
			}
			count--;
			total -= size;
		}
	}

	private static long modified(Path p) {
		try {
			return Files.getLastModifiedTime(p).toMillis();
		}
		catch (IOException e) {
			return 0;
		}
	}

	private static long size(Path p) {
		try {
			return Files.size(p);
		}
		catch (IOException e) {
			return 0;
		}
	}
}
