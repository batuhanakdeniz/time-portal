package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Yalnızca 127.0.0.1 üzerinde yerel bir sunucuyla; dış ağa çıkmaz. */
class JdkImageHttpTest {

	private HttpServer server;
	private final AtomicInteger redirectTargetHits = new AtomicInteger();

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/ok", ex -> respond(ex, 200, "merhaba".getBytes(StandardCharsets.UTF_8)));
		server.createContext("/big", ex -> {
			ex.sendResponseHeaders(200, 0);
			try (OutputStream o = ex.getResponseBody()) {
				byte[] chunk = new byte[8192];
				for (int i = 0; i < 400; i++) {
					o.write(chunk);
				}
			}
			catch (IOException ignored) {
				// istemci bağlantıyı kapattı
			}
		});
		server.createContext("/slow", ex -> {
			ex.sendResponseHeaders(200, 0);
			try (OutputStream o = ex.getResponseBody()) {
				o.write("baslangic".getBytes(StandardCharsets.UTF_8));
				o.flush();
				Thread.sleep(3000);
				o.write("son".getBytes(StandardCharsets.UTF_8));
			}
			catch (IOException | InterruptedException ignored) {
				// istemci bağlantıyı kapattı
			}
		});
		server.createContext("/err", ex -> {
			byte[] b = new byte[5000];
			Arrays.fill(b, (byte) 'e');
			respond(ex, 500, b);
		});
		server.createContext("/redirect", ex -> {
			ex.getResponseHeaders().add("Location", base() + "/target");
			ex.sendResponseHeaders(302, -1);
			ex.close();
		});
		server.createContext("/target", ex -> {
			redirectTargetHits.incrementAndGet();
			respond(ex, 200, "hedef".getBytes(StandardCharsets.UTF_8));
		});
		server.start();
	}

	private static void respond(com.sun.net.httpserver.HttpExchange ex, int status, byte[] body) throws IOException {
		ex.sendResponseHeaders(status, body.length);
		try (OutputStream o = ex.getResponseBody()) {
			o.write(body);
		}
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	private String base() {
		return "http://127.0.0.1:" + server.getAddress().getPort();
	}

	@Test
	void readsNormalBody() throws IOException {
		JdkImageHttp http = new JdkImageHttp(Duration.ofSeconds(5), 1024, HttpClient.Redirect.NORMAL);

		assertThat(http.get(base() + "/ok", Map.of())).isEqualTo("merhaba");
	}

	@Test
	void bodyLargerThanTheLimitIsRejected() {
		JdkImageHttp http = new JdkImageHttp(Duration.ofSeconds(5), 64 * 1024, HttpClient.Redirect.NORMAL);

		assertThatThrownBy(() -> http.get(base() + "/big", Map.of())).isInstanceOf(IOException.class)
			.hasMessageContaining("too large");
	}

	@Test
	void slowTrickledBodyHitsTheTotalTimeout() {
		JdkImageHttp http = new JdkImageHttp(Duration.ofMillis(400), 1024, HttpClient.Redirect.NORMAL);

		long start = System.nanoTime();
		assertThatThrownBy(() -> http.get(base() + "/slow", Map.of())).isInstanceOf(IOException.class)
			.hasMessageContaining("timed out");
		assertThat((System.nanoTime() - start) / 1_000_000).isLessThan(2500);
	}

	@Test
	void errorBodyIsTruncatedNotRejected() {
		JdkImageHttp http = new JdkImageHttp(Duration.ofSeconds(5), 100, HttpClient.Redirect.NORMAL);

		assertThatThrownBy(() -> http.get(base() + "/err", Map.of())).isInstanceOfSatisfying(HttpStatusException.class, e -> {
			assertThat(e.status()).isEqualTo(500);
			assertThat(e.body()).hasSize(100);
		});
	}

	@Test
	void redirectsAreFollowedOnlyWhenAllowed() throws IOException {
		assertThat(new JdkImageHttp(Duration.ofSeconds(5), 1024, HttpClient.Redirect.NORMAL).get(base() + "/redirect",
				Map.of()))
			.isEqualTo("hedef");
		assertThat(redirectTargetHits).hasValue(1);

		JdkImageHttp never = new JdkImageHttp(Duration.ofSeconds(5), 1024, HttpClient.Redirect.NEVER);
		assertThatThrownBy(() -> never.get(base() + "/redirect", Map.of())).isInstanceOfSatisfying(HttpStatusException.class,
				e -> assertThat(e.status()).isEqualTo(302));
		assertThat(redirectTargetHits).hasValue(1);
	}
}
