package com.timeportal.image;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * {@link java.net.http.HttpClient} ile {@link ImageHttp}.
 *
 * <p>Toplam istek süresi (bağlantı + başlık + gövde) {@link #TIMEOUT} ile sınırlıdır; gövde yavaş
 * akıyorsa bekçi iş parçacığı akışı kapatır. Gövde en çok {@link #MAX_BODY_BYTES} bayt okunur; 2xx
 * yanıt bundan büyükse hata verilir, hata yanıtlarının gövdesi ise kırpılır.
 */
public class JdkImageHttp implements ImageHttp {

	static final Duration TIMEOUT = Duration.ofSeconds(10);
	static final int MAX_BODY_BYTES = 2 * 1024 * 1024;

	private static final ScheduledExecutorService WATCHDOG = Executors.newSingleThreadScheduledExecutor(r -> {
		Thread t = new Thread(r, "image-http-watchdog");
		t.setDaemon(true);
		return t;
	});

	private final HttpClient client;
	private final Duration timeout;
	private final int maxBodyBytes;

	/** Yönlendirmeler izlenir (Commons için). */
	public JdkImageHttp() {
		this(HttpClient.Redirect.NORMAL);
	}

	public JdkImageHttp(HttpClient.Redirect redirect) {
		this(TIMEOUT, MAX_BODY_BYTES, redirect);
	}

	JdkImageHttp(Duration timeout, int maxBodyBytes, HttpClient.Redirect redirect) {
		this.timeout = timeout;
		this.maxBodyBytes = maxBodyBytes;
		this.client = HttpClient.newBuilder().connectTimeout(timeout).followRedirects(redirect).build();
	}

	@Override
	public String get(String url, Map<String, String> headers) throws IOException {
		long startNanos = System.nanoTime();
		HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url)).timeout(timeout).GET();
		headers.forEach(request::header);
		try {
			HttpResponse<InputStream> response = client.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
			boolean ok = response.statusCode() / 100 == 2;
			String body = readBody(response.body(), ok, startNanos);
			if (!ok) {
				throw new HttpStatusException(response.statusCode(), body);
			}
			return body;
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IOException("interrupted");
		}
	}

	private String readBody(InputStream stream, boolean failIfTooLarge, long startNanos) throws IOException {
		long remainingNanos = Math.max(TimeUnit.MILLISECONDS.toNanos(1), timeout.toNanos() - (System.nanoTime() - startNanos));
		AtomicBoolean timedOut = new AtomicBoolean();
		ScheduledFuture<?> watchdog = WATCHDOG.schedule(() -> {
			timedOut.set(true);
			try {
				stream.close();
			}
			catch (IOException ignored) {
				// kapatma hatası önemsiz
			}
		}, remainingNanos, TimeUnit.NANOSECONDS);
		try (stream) {
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			byte[] buf = new byte[8192];
			int total = 0;
			int n;
			while ((n = stream.read(buf)) != -1) {
				int room = maxBodyBytes - total;
				if (n > room) {
					if (failIfTooLarge) {
						throw new IOException("response body too large");
					}
					out.write(buf, 0, room);
					break;
				}
				out.write(buf, 0, n);
				total += n;
			}
			return out.toString(StandardCharsets.UTF_8);
		}
		catch (IOException e) {
			if (timedOut.get()) {
				throw new IOException("response timed out");
			}
			throw e;
		}
		finally {
			watchdog.cancel(false);
		}
	}
}
