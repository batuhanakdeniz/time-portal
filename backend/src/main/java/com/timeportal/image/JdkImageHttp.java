package com.timeportal.image;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/** {@link java.net.http.HttpClient} ile {@link ImageHttp}. Bağlantı ve istek zaman aşımı 10 sn. */
public class JdkImageHttp implements ImageHttp {

	static final Duration TIMEOUT = Duration.ofSeconds(10);

	private final HttpClient client = HttpClient.newBuilder()
		.connectTimeout(TIMEOUT)
		.followRedirects(HttpClient.Redirect.NORMAL)
		.build();

	@Override
	public String get(String url, Map<String, String> headers) throws IOException {
		HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url)).timeout(TIMEOUT).GET();
		headers.forEach(request::header);
		try {
			HttpResponse<String> response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
			if (response.statusCode() / 100 != 2) {
				throw new HttpStatusException(response.statusCode(), response.body());
			}
			return response.body();
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IOException("interrupted");
		}
	}
}
