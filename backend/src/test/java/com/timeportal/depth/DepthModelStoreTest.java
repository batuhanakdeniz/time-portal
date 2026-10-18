package com.timeportal.depth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DepthModelStoreTest {

	private static final byte[] MODEL = "sahte-model-icerigi".getBytes(StandardCharsets.UTF_8);

	@TempDir
	Path dir;

	private static String sha(byte[] b) throws Exception {
		return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
	}

	private DepthModelStore store(DepthModelStore.Downloader d) throws Exception {
		return new DepthModelStore(dir, "https://example.test/model.onnx", sha(MODEL), d);
	}

	@Test
	void downloadsVerifiesAndMovesAtomicallyThenReusesFile() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		DepthModelStore store = store((url, target) -> {
			calls.incrementAndGet();
			assertThat(url).isEqualTo("https://example.test/model.onnx");
			Files.write(target, MODEL);
		});

		Path model = store.ensureModel();

		assertThat(model).exists().hasBinaryContent(MODEL);
		assertThat(model.getParent()).isEqualTo(dir);
		try (var files = Files.list(dir)) {
			assertThat(files.map(p -> p.getFileName().toString())).containsExactly(DepthModelStore.FILE_NAME);
		}
		assertThat(store.ensureModel()).isEqualTo(model);
		// yeni bir nesne bile diskteki doğrulanmış dosyayı kullanır
		assertThat(store(failing()).ensureModel()).isEqualTo(model);
		assertThat(calls).hasValue(1);
	}

	private static DepthModelStore.Downloader failing() {
		return (url, target) -> {
			throw new IOException("ağ yok");
		};
	}

	@Test
	void checksumMismatchRejectsAndLeavesNoFilesThenRetries() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		DepthModelStore store = store((url, target) -> {
			calls.incrementAndGet();
			Files.write(target, calls.get() == 1 ? "bozuk".getBytes(StandardCharsets.UTF_8) : MODEL);
		});

		assertThatThrownBy(store::ensureModel).isInstanceOf(IOException.class).hasMessageContaining("checksum mismatch");
		try (var files = Files.list(dir)) {
			assertThat(files).isEmpty();
		}
		// başarısızlık önbelleğe alınmaz
		assertThat(store.ensureModel()).exists();
		assertThat(calls).hasValue(2);
	}

	@Test
	void downloadFailureLeavesNoPartialFile() throws Exception {
		DepthModelStore store = store((url, target) -> {
			Files.write(target, new byte[] {1, 2, 3});
			throw new IOException("bağlantı koptu");
		});

		assertThatThrownBy(store::ensureModel).isInstanceOf(IOException.class);
		try (var files = Files.list(dir)) {
			assertThat(files).isEmpty();
		}
	}

	@Test
	void corruptExistingFileIsReplaced() throws Exception {
		Files.write(dir.resolve(DepthModelStore.FILE_NAME), "yarım".getBytes(StandardCharsets.UTF_8));
		AtomicInteger calls = new AtomicInteger();

		Path model = store((url, target) -> {
			calls.incrementAndGet();
			Files.write(target, MODEL);
		}).ensureModel();

		assertThat(model).hasBinaryContent(MODEL);
		assertThat(calls).hasValue(1);
	}

	@Test
	void concurrentFirstRequestsShareASingleDownload() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		CountDownLatch start = new CountDownLatch(1);
		DepthModelStore store = store((url, target) -> {
			calls.incrementAndGet();
			try {
				Thread.sleep(150);
			}
			catch (InterruptedException e) {
				throw new IOException(e);
			}
			Files.write(target, MODEL);
		});
		int n = 8;
		ExecutorService pool = Executors.newFixedThreadPool(n);
		try {
			List<Future<Path>> results = new ArrayList<>();
			for (int i = 0; i < n; i++) {
				results.add(pool.submit(() -> {
					start.await();
					return store.ensureModel();
				}));
			}
			start.countDown();
			for (Future<Path> f : results) {
				assertThat(f.get()).exists();
			}
		}
		finally {
			pool.shutdownNow();
		}
		assertThat(calls).hasValue(1);
	}

	@Test
	void defaultsPointAtPinnedHuggingFaceCommit() {
		assertThat(DepthModelStore.DEFAULT_URL).startsWith("https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/")
			.contains("4472b7362082ad9968fee890ca0f1e5aca36b93d")
			.endsWith("/onnx/model.onnx");
		assertThat(DepthModelStore.DEFAULT_SHA256).hasSize(64).matches("[a-f0-9]+");
	}

	@Test
	void copyLimitedStopsAtTheByteLimit() throws Exception {
		Path ok = dir.resolve("ok.bin");
		HttpModelDownloader.copyLimited(new java.io.ByteArrayInputStream(new byte[100]), ok, 100);
		assertThat(Files.size(ok)).isEqualTo(100);

		assertThatThrownBy(() -> HttpModelDownloader.copyLimited(new java.io.ByteArrayInputStream(new byte[101]),
				dir.resolve("big.bin"), 100)).isInstanceOf(IOException.class).hasMessageContaining("exceeds");
	}
}
