package com.timeportal.depth;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;

/** Model dosyasını https üzerinden indirir (yönlendirmeler izlenir; Hugging Face CDN'e yönlendirir). */
public class HttpModelDownloader implements DepthModelStore.Downloader {

	private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(15);
	private static final Duration REQUEST_TIMEOUT = Duration.ofMinutes(15);

	private final HttpClient client = HttpClient.newBuilder()
		.connectTimeout(CONNECT_TIMEOUT)
		.followRedirects(HttpClient.Redirect.NORMAL)
		.build();

	@Override
	public void download(String url, Path target) throws IOException {
		if (!url.startsWith("https://")) {
			throw new IOException("model url must be https");
		}
		HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(REQUEST_TIMEOUT).GET().build();
		try {
			HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
			try (InputStream body = response.body()) {
				if (response.statusCode() / 100 != 2) {
					throw new IOException("model download returned HTTP " + response.statusCode());
				}
				Files.copy(body, target, StandardCopyOption.REPLACE_EXISTING);
			}
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IOException("model download interrupted");
		}
	}
}
