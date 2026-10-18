package com.timeportal.artifact;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
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
 *
 * <p>SSRF: ilk adres ve her yönlendirme izin listesindeki ana makinelere ve 443'e gitmeli; çözülen IP
 * loopback/link-local/site-local/any-local/multicast olamaz. Sınır: çözümleme ile gerçek bağlantı
 * ayrı DNS sorgularıdır (DNS rebinding'e karşı tam koruma değil; izin listesi asıl savunmadır).
 */
public class HttpImageFetcher implements ImageFetcher {

	public static final int MAX_BYTES = 15 * 1024 * 1024;
	public static final Duration TOTAL_TIMEOUT = Duration.ofSeconds(15);
	static final int MAX_REDIRECTS = 3;
	/**
	 * Varsayılan izin listesi: Commons görselleri {@code upload.wikimedia.org}'da, bu adres küçük
	 * resimleri {@code thumb.wikimedia.org}'a yönlendirebilir (gerçek denemede görüldü); Mapillary
	 * görselleri {@code scontent.<kod>.fna.fbcdn.net}'te.
	 */
	public static final String DEFAULT_ALLOWED_HOSTS = "upload.wikimedia.org,thumb.wikimedia.org,*.fbcdn.net";
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

	/** Ana makine adını IP adreslerine çözer (testlerde sahtelenir). */
	@FunctionalInterface
	public interface Resolver {
		InetAddress[] resolve(String host) throws IOException;
	}

	private final Transport transport;
	private final int maxBytes;
	private final Duration timeout;
	private final List<String> allowedHosts;
	private final Resolver resolver;

	/**
	 * Gerçek istemci. {@code allowedHosts}: izinli ana makineler; {@code *.örnek.net} biçimi alt alan
	 * adlarını (ve yalnızca onları) kapsar. Adres ve her yönlendirme izin listesine uymalı, ayrıca
	 * çözülen IP loopback/link-local/site-local/any-local/multicast olmamalı (SSRF).
	 */
	public HttpImageFetcher(List<String> allowedHosts) {
		this(jdkTransport(TOTAL_TIMEOUT), MAX_BYTES, TOTAL_TIMEOUT, allowedHosts, InetAddress::getAllByName);
	}

	public HttpImageFetcher(Transport transport, int maxBytes, Duration timeout, List<String> allowedHosts,
			Resolver resolver) {
		this.transport = transport;
		this.maxBytes = maxBytes;
		this.timeout = timeout;
		this.allowedHosts = allowedHosts.stream().map(h -> h.strip().toLowerCase(Locale.ROOT)).filter(h -> !h.isEmpty()).toList();
		this.resolver = resolver;
	}

	/** Testler için: her ana makineye izin verir, adres kontrolü yok. */
	HttpImageFetcher(Transport transport, int maxBytes, Duration timeout) {
		this(transport, maxBytes, timeout, List.of("*"), host -> new InetAddress[0]);
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
		URI uri = requireAllowed(requireHttps(url));
		for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
			if (System.nanoTime() - deadline >= 0) {
				throw new IOException("image download timed out");
			}
			try (Response response = transport.open(uri)) {
				int status = response.status();
				if (status / 100 == 3 && response.location() != null) {
					URI next;
					try {
						next = uri.resolve(response.location());
					}
					catch (IllegalArgumentException e) {
						throw new IOException("invalid redirect location");
					}
					uri = requireAllowed(requireHttps(next.toString()));
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

	/** Host izin listesinde, bağlantı noktası 443 ve çözülen adreslerin hiçbiri iç ağa ait olmalı. */
	private URI requireAllowed(URI uri) throws IOException {
		String host = uri.getHost().toLowerCase(Locale.ROOT);
		if (uri.getPort() != -1 && uri.getPort() != 443) {
			throw new IOException("image url port not allowed");
		}
		if (!hostAllowed(host)) {
			// Yalnızca ana makine adı (imzalı adres/sorgu dizesi loga girmesin)
			throw new IOException("image host not allowed: " + host);
		}
		for (InetAddress a : resolver.resolve(host)) {
			if (a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress() || a.isAnyLocalAddress()
					|| a.isMulticastAddress()) {
				throw new IOException("image host resolves to a non-public address");
			}
		}
		return uri;
	}

	private boolean hostAllowed(String host) {
		for (String rule : allowedHosts) {
			if (rule.equals("*") || rule.equals(host) || (rule.startsWith("*.") && host.endsWith(rule.substring(1)))) {
				return true;
			}
		}
		return false;
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
