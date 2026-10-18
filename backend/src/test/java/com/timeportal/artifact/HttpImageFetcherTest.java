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

	private static HttpImageFetcher strict(java.util.function.Function<URI, HttpImageFetcher.Response> responder,
			List<String> hosts, List<URI> seen, HttpImageFetcher.Resolver resolver) {
		return new HttpImageFetcher(uri -> {
			seen.add(uri);
			return responder.apply(uri);
		}, 1 << 20, Duration.ofSeconds(5), hosts, resolver);
	}

	private static final HttpImageFetcher.Resolver PUBLIC = host -> new java.net.InetAddress[] {
			java.net.InetAddress.getByAddress(new byte[] {93, (byte) 184, (byte) 216, 34})};

	@Test
	void rejectsLiteralInternalAddressesAndHostsOutsideTheAllowList() throws IOException {
		byte[] jpeg = encode("jpg", 8, 8);
		List<URI> seen = new ArrayList<>();
		HttpImageFetcher f = strict(u -> ok("image/jpeg", jpeg), List.of("upload.wikimedia.org", "*.fbcdn.net"), seen, PUBLIC);
		for (String url : new String[] {"https://127.0.0.1/a.jpg", "https://169.254.169.254/latest/meta-data",
				"https://10.0.0.1/a.jpg", "https://[::1]/a.jpg", "https://evil.example/a.jpg",
				"https://upload.wikimedia.org.evil.example/a.jpg", "https://fbcdn.net/a.jpg", "https://notfbcdn.net/a.jpg",
				"https://upload.wikimedia.org:8443/a.jpg"}) {
			assertThatThrownBy(() -> f.fetch(url)).as(url).isInstanceOf(IOException.class);
		}
		assertThat(seen).isEmpty();
		assertThat(f.fetch("https://upload.wikimedia.org/a.jpg").ext()).isEqualTo("jpg");
		assertThat(f.fetch("https://scontent.fist7-1.fna.fbcdn.net/m1/v/t6/x.jpg?stp=s2048x1024").ext()).isEqualTo("jpg");
	}

	@Test
	void rejectsAllowedHostThatResolvesToInternalAddress() {
		for (byte[] ip : new byte[][] {{127, 0, 0, 1}, {(byte) 169, (byte) 254, (byte) 169, (byte) 254}, {10, 0, 0, 1},
				{(byte) 192, (byte) 168, 1, 1}, {0, 0, 0, 0}, {(byte) 224, 0, 0, 1}}) {
			List<URI> seen = new ArrayList<>();
			HttpImageFetcher f = strict(u -> ok("image/jpeg", new byte[1]), List.of("127.0.0.1", "cdn.test"), seen,
					host -> new java.net.InetAddress[] {java.net.InetAddress.getByAddress(ip)});
			assertThatThrownBy(() -> f.fetch("https://cdn.test/a.jpg")).isInstanceOf(IOException.class)
				.hasMessageContaining("non-public");
			assertThat(seen).isEmpty();
		}
		HttpImageFetcher ipv6 = strict(u -> ok("image/jpeg", new byte[1]), List.of("cdn.test"), new ArrayList<>(),
				host -> new java.net.InetAddress[] {java.net.InetAddress.getByName("::1")});
		assertThatThrownBy(() -> ipv6.fetch("https://cdn.test/a.jpg")).isInstanceOf(IOException.class);
	}

	@Test
	void redirectFromAllowedHostToDisallowedOrInternalHostIsRejected() throws IOException {
		List<URI> seen = new ArrayList<>();
		HttpImageFetcher toEvil = strict(u -> new HttpImageFetcher.Response(302, "", -1, "https://evil.example/x.jpg",
				new ByteArrayInputStream(new byte[0])), List.of("cdn.test"), seen, PUBLIC);
		assertThatThrownBy(() -> toEvil.fetch("https://cdn.test/a.jpg")).isInstanceOf(IOException.class)
			.hasMessageContaining("not allowed");
		assertThat(seen).extracting(URI::getHost).containsExactly("cdn.test");

		HttpImageFetcher toMetadata = strict(u -> new HttpImageFetcher.Response(302, "", -1,
				"https://169.254.169.254/latest", new ByteArrayInputStream(new byte[0])), List.of("cdn.test"),
				new ArrayList<>(), PUBLIC);
		assertThatThrownBy(() -> toMetadata.fetch("https://cdn.test/a.jpg")).isInstanceOf(IOException.class);
	}

	@Test
	void malformedRedirectLocationIsAnIoException() {
		HttpImageFetcher f = fetcher(u -> new HttpImageFetcher.Response(302, "", -1, "ht!tp://bad host/\\x",
				new ByteArrayInputStream(new byte[0])), 1 << 20, new ArrayList<>());
		assertThatThrownBy(() -> f.fetch("https://x.test/a")).isInstanceOf(IOException.class);
	}

	@Test
	void totalTimeBudgetIsCheckedBeforeEachRedirectHop() {
		HttpImageFetcher f = new HttpImageFetcher(u -> {
			try {
				Thread.sleep(120);
			}
			catch (InterruptedException e) {
				throw new IOException(e);
			}
			return new HttpImageFetcher.Response(302, "", -1, "/next", new ByteArrayInputStream(new byte[0]));
		}, 1 << 20, Duration.ofMillis(200));
		assertThatThrownBy(() -> f.fetch("https://x.test/a")).isInstanceOf(IOException.class)
			.hasMessageContaining("timed out");
	}

	@Test
	void rejectsImagesOver24Megapixels() throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(5000, 5000, BufferedImage.TYPE_BYTE_GRAY), "png", out);
		byte[] png = out.toByteArray();
		HttpImageFetcher f = fetcher(u -> ok("image/png", png), 15 * 1024 * 1024, new ArrayList<>());
		assertThatThrownBy(() -> f.fetch("https://x.test/a.png")).isInstanceOf(IOException.class)
			.hasMessageContaining("dimensions");
	}
}
