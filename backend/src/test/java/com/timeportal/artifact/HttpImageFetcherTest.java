package com.timeportal.artifact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class HttpImageFetcherTest {

	private static byte[] encode(String format, int w, int h) throws IOException {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < w; x++) {
				img.setRGB(x, y, (x * 7 + y * 3) & 0xFFFFFF);
			}
		}
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, format, out);
		return out.toByteArray();
	}

	private static HttpImageFetcher.Response ok(String type, byte[] body) {
		return new HttpImageFetcher.Response(200, type, body.length, null, new ByteArrayInputStream(body));
	}

	private static HttpImageFetcher fetcher(Function<URI, HttpImageFetcher.Response> responder, int maxBytes,
			List<URI> seen) {
		return new HttpImageFetcher(uri -> {
			seen.add(uri);
			return responder.apply(uri);
		}, maxBytes, Duration.ofSeconds(5));
	}

	@Test
	void fetchesAndDecodesJpegAndPng() throws IOException {
		byte[] jpeg = encode("jpg", 32, 16);
		byte[] png = encode("png", 20, 10);

		FetchedImage a = fetcher(u -> ok("image/jpeg", jpeg), 1 << 20, new ArrayList<>()).fetch("https://x.test/a.jpg");
		FetchedImage b = fetcher(u -> ok("image/png; charset=binary", png), 1 << 20, new ArrayList<>()).fetch("https://x.test/b");

		assertThat(a.ext()).isEqualTo("jpg");
		assertThat(a.image().getWidth()).isEqualTo(32);
		assertThat(a.bytes()).isEqualTo(jpeg);
		assertThat(b.ext()).isEqualTo("png");
		assertThat(b.image().getHeight()).isEqualTo(10);
	}

	@Test
	void rejectsNonHttpsUrls() {
		HttpImageFetcher f = fetcher(u -> {
			throw new AssertionError("ağa gidilmemeli");
		}, 1 << 20, new ArrayList<>());
		for (String url : new String[] {"http://x.test/a.jpg", "ftp://x.test/a.jpg", "file:///etc/passwd", "//x.test/a.jpg",
				"not a url", "https:///nohost"}) {
			assertThatThrownBy(() -> f.fetch(url)).as(url).isInstanceOf(IOException.class);
		}
	}

	@Test
	void rejectsRedirectToHttpAndFollowsHttpsRedirects() throws IOException {
		byte[] jpeg = encode("jpg", 8, 8);
		HttpImageFetcher toHttp = fetcher(u -> new HttpImageFetcher.Response(302, "", -1, "http://evil.test/a.jpg",
				new ByteArrayInputStream(new byte[0])), 1 << 20, new ArrayList<>());
		assertThatThrownBy(() -> toHttp.fetch("https://x.test/a.jpg")).isInstanceOf(IOException.class)
			.hasMessageContaining("https");

		List<URI> seen = new ArrayList<>();
		HttpImageFetcher follow = fetcher(u -> u.getPath().equals("/a.jpg")
				? new HttpImageFetcher.Response(301, "", -1, "/b.jpg", new ByteArrayInputStream(new byte[0]))
				: ok("image/jpeg", jpeg), 1 << 20, seen);
		assertThat(follow.fetch("https://x.test/a.jpg").image().getWidth()).isEqualTo(8);
		assertThat(seen).extracting(URI::toString).containsExactly("https://x.test/a.jpg", "https://x.test/b.jpg");
	}

	@Test
	void stopsAfterTooManyRedirects() {
		HttpImageFetcher loop = fetcher(u -> new HttpImageFetcher.Response(302, "", -1, "/again",
				new ByteArrayInputStream(new byte[0])), 1 << 20, new ArrayList<>());
		assertThatThrownBy(() -> loop.fetch("https://x.test/a")).isInstanceOf(IOException.class)
			.hasMessageContaining("redirects");
	}

	@Test
	void rejectsHttpErrorStatus() {
		HttpImageFetcher f = fetcher(u -> new HttpImageFetcher.Response(403, "image/jpeg", 3, null,
				new ByteArrayInputStream(new byte[3])), 1 << 20, new ArrayList<>());
		assertThatThrownBy(() -> f.fetch("https://x.test/a.jpg")).isInstanceOf(IOException.class)
			.hasMessageContaining("403");
	}

	@Test
	void rejectsWrongMimeTypes() throws IOException {
		byte[] jpeg = encode("jpg", 8, 8);
		for (String type : new String[] {"text/html", "image/gif", "image/svg+xml", "application/octet-stream", ""}) {
			HttpImageFetcher f = fetcher(u -> ok(type, jpeg), 1 << 20, new ArrayList<>());
			assertThatThrownBy(() -> f.fetch("https://x.test/a")).as(type).isInstanceOf(IOException.class)
				.hasMessageContaining("content type");
		}
	}

	@Test
	void rejectsBodyOverLimitByDeclaredLengthAndByActualStream() throws IOException {
		byte[] jpeg = encode("jpg", 64, 64);
		HttpImageFetcher declared = fetcher(u -> new HttpImageFetcher.Response(200, "image/jpeg", 10_000_000L, null,
				new ByteArrayInputStream(jpeg)), 1000, new ArrayList<>());
		assertThatThrownBy(() -> declared.fetch("https://x.test/a")).isInstanceOf(IOException.class)
			.hasMessageContaining("too large");

		// Content-Length yok/yalan: gerçek akış sınırı aşar
		HttpImageFetcher actual = fetcher(u -> new HttpImageFetcher.Response(200, "image/jpeg", -1, null,
				new ByteArrayInputStream(new byte[5000])), 1000, new ArrayList<>());
		assertThatThrownBy(() -> actual.fetch("https://x.test/a")).isInstanceOf(IOException.class)
			.hasMessageContaining("too large");
	}

	@Test
	void rejectsContentThatIsNotARealImageDespiteImageHeader() {
		HttpImageFetcher f = fetcher(u -> ok("image/jpeg", "<html>not an image</html>".getBytes()), 1 << 20,
				new ArrayList<>());
		assertThatThrownBy(() -> f.fetch("https://x.test/a.jpg")).isInstanceOf(IOException.class);

		byte[] truncated = new byte[0];
		try {
			byte[] full = encode("jpg", 64, 64);
			truncated = java.util.Arrays.copyOf(full, 40);
		}
		catch (IOException e) {
			throw new AssertionError(e);
		}
		byte[] cut = truncated;
		HttpImageFetcher g = fetcher(u -> ok("image/jpeg", cut), 1 << 20, new ArrayList<>());
		assertThatThrownBy(() -> g.fetch("https://x.test/a.jpg")).isInstanceOf(IOException.class);
	}

	@Test
	void rejectsImageFormatsOtherThanJpegAndPngEvenWithAllowedHeader() throws IOException {
		byte[] gif = encode("gif", 8, 8);
		HttpImageFetcher f = fetcher(u -> ok("image/png", gif), 1 << 20, new ArrayList<>());
		assertThatThrownBy(() -> f.fetch("https://x.test/a.png")).isInstanceOf(IOException.class)
			.hasMessageContaining("unsupported");
	}

	@Test
	void rejectsHugeDimensionsBeforeDecoding() throws IOException {
		// 9000x9000 = 81 MP > 64 MP sınırı; tek renkli PNG küçük baytla büyük boyut taşır
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(9000, 9000, BufferedImage.TYPE_BYTE_GRAY), "png", out);
		byte[] png = out.toByteArray();
		assertThat(png.length).isLessThan(15 * 1024 * 1024);
		HttpImageFetcher f = fetcher(u -> ok("image/png", png), 15 * 1024 * 1024, new ArrayList<>());
		assertThatThrownBy(() -> f.fetch("https://x.test/a.png")).isInstanceOf(IOException.class)
			.hasMessageContaining("dimensions");
	}

	@Test
	void slowBodyTimesOut() {
		InputStream blocking = new InputStream() {
			private volatile boolean closed;

			@Override
			public int read() throws IOException {
				while (!closed) {
					try {
						Thread.sleep(10);
					}
					catch (InterruptedException e) {
						throw new IOException(e);
					}
				}
				throw new IOException("closed");
			}

			@Override
			public void close() {
				closed = true;
			}
		};
		HttpImageFetcher f = new HttpImageFetcher(u -> new HttpImageFetcher.Response(200, "image/jpeg", -1, null, blocking),
				1 << 20, Duration.ofMillis(200));
		assertThatThrownBy(() -> f.fetch("https://x.test/a.jpg")).isInstanceOf(IOException.class)
			.hasMessageContaining("timed out");
	}
}
