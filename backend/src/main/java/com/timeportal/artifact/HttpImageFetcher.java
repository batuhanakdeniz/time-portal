package com.timeportal.artifact;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Görseli güvenli biçimde indirir. Mapillary adresleri imzalı ve süreli olduğundan görsel hotlink
 * edilmez, backend indirir. Kurallar: her adım (yönlendirmeler dahil) yalnızca https; en çok
 * {@value #MAX_REDIRECTS} yönlendirme; gövde en çok {@link #MAX_BYTES}; toplam süre
 * {@link #TOTAL_TIMEOUT}; {@code Content-Type} image/jpeg ya da image/png olmalı ve içerik gerçekten
 * çözülebilir bir görsel olmalı ({@link ImageDecoder}). Kimlik bilgisi/başlık gönderilmez.
 */
public class HttpImageFetcher implements ImageFetcher {

	public static final int MAX_BYTES = 15 * 1024 * 1024;
	public static final Duration TOTAL_TIMEOUT = Duration.ofSeconds(15);
	static final int MAX_REDIRECTS = 3;
	static final String USER_AGENT = "time-portal/0.1 (https://github.com/batuhanakdeniz/time-portal)";

	/** Tek bir GET'in yanıtı; gövde okunana kadar açık kalır. */
	public record Response(int status, String contentType, long contentLength, String location, InputStream body)
			implements Closeable {

		@Override
		public void close() throws IOException {
			body.close();
		}
	}

	/** Yönlendirme izlemeyen tek GET (testlerde sahtelenir). */
	@FunctionalInterface
	public interface Transport {
		Response open(URI uri) throws IOException;
	}

	private static final ScheduledExecutorService WATCHDOG = Executors.newSingleThreadScheduledExecutor(r -> {
		Thread t = new Thread(r, "artifact-fetch-watchdog");
		t.setDaemon(true);
		return t;
	});

	private final Transport transport;
	private final int maxBytes;
	private final Duration timeout;

	public HttpImageFetcher() {
		this(jdkTransport(TOTAL_TIMEOUT), MAX_BYTES, TOTAL_TIMEOUT);
	}

	public HttpImageFetcher(Transport transport, int maxBytes, Duration timeout) {
		this.transport = transport;
		this.maxBytes = maxBytes;
		this.timeout = timeout;
	}

	private static Transport jdkTransport(Duration timeout) {
		HttpClient client = HttpClient.newBuilder().connectTimeout(timeout).followRedirects(HttpClient.Redirect.NEVER).build();
		return uri -> {
			HttpRequest request = HttpRequest.newBuilder(uri)
				.timeout(timeout)
				.header("User-Agent", USER_AGENT)
				.header("Accept", "image/jpeg,image/png")
				.GET()
				.build();
			try {
				HttpResponse<InputStream> r = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
				return new Response(r.statusCode(), r.headers().firstValue("Content-Type").orElse(""),
						r.headers().firstValueAsLong("Content-Length").orElse(-1), r.headers().firstValue("Location").orElse(null),
						r.body());
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				throw new IOException("interrupted");
			}
		};
	}

	@Override
	public FetchedImage fetch(String url) throws IOException {
		long deadline = System.nanoTime() + timeout.toNanos();
		URI uri = requireHttps(url);
		for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
			try (Response response = transport.open(uri)) {
				int status = response.status();
				if (status / 100 == 3 && response.location() != null) {
					uri = requireHttps(uri.resolve(response.location()).toString());
					continue;
				}
				if (status / 100 != 2) {
					throw new IOException("image download returned HTTP " + status);
				}
				requireImageType(response.contentType());
				if (response.contentLength() > maxBytes) {
					throw new IOException("image too large");
				}
				return ImageDecoder.decode(readLimited(response.body(), deadline));
			}
		}
		throw new IOException("too many redirects");
	}

	static URI requireHttps(String url) throws IOException {
		URI uri;
		try {
			uri = URI.create(url);
		}
		catch (IllegalArgumentException e) {
			throw new IOException("invalid image url");
		}
		if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
			throw new IOException("image url must be https");
		}
		return uri;
	}

	static void requireImageType(String contentType) throws IOException {
		String type = contentType == null ? "" : contentType.split(";", 2)[0].strip().toLowerCase(Locale.ROOT);
		if (!type.equals("image/jpeg") && !type.equals("image/png")) {
			throw new IOException("unsupported content type");
		}
	}

	private byte[] readLimited(InputStream in, long deadlineNanos) throws IOException {
		AtomicBoolean timedOut = new AtomicBoolean();
		long remaining = Math.max(1, deadlineNanos - System.nanoTime());
		ScheduledFuture<?> watchdog = WATCHDOG.schedule(() -> {
			timedOut.set(true);
			try {
				in.close();
			}
			catch (IOException ignored) {
				// kapatma hatası önemsiz
			}
		}, remaining, TimeUnit.NANOSECONDS);
		try {
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			byte[] buf = new byte[16 * 1024];
			int total = 0;
			int n;
			while ((n = in.read(buf)) != -1) {
				total += n;
				if (total > maxBytes) {
					throw new IOException("image too large");
				}
				out.write(buf, 0, n);
			}
			return out.toByteArray();
		}
		catch (IOException e) {
			if (timedOut.get()) {
				throw new IOException("image download timed out");
			}
			throw e;
		}
		finally {
			watchdog.cancel(false);
		}
	}
}
