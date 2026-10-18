package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.timeportal.artifact.FetchedImage;
import com.timeportal.artifact.HttpImageFetcher;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

/**
 * Regresyon: Commons'tan gelen gerçek adres biçimi (sorgu dizeli upload.wikimedia.org) ve küçük
 * resim yönlendirmesi, varsayılan izin listesiyle indirilebilmeli (Çankaya olayı: upload.wikimedia.org
 * adresi thumb.wikimedia.org'a yönlendirdi ve liste bunu içermiyordu).
 */
class CommonsToFetcherTest {

	private static final List<String> DEFAULTS = List.of(HttpImageFetcher.DEFAULT_ALLOWED_HOSTS.split(","));

	private static HttpImageFetcher.Resolver publicDns() {
		return host -> new InetAddress[] {InetAddress.getByAddress(new byte[] {93, (byte) 184, (byte) 216, 34})};
	}

	private static byte[] jpeg() throws Exception {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(16, 8, BufferedImage.TYPE_INT_RGB), "jpg", out);
		return out.toByteArray();
	}

	@Test
	void commonsUrlFromFinderPassesTheDefaultHostAllowListIncludingThumbRedirect() throws Exception {
		CityImage found = new WikimediaCommonsImageSource(FakeHttp.always("commons-real-format.json"), true)
			.find(39.92, 32.85, 1000)
			.orElseThrow();
		assertThat(URI.create(found.url()).getHost()).isEqualTo("upload.wikimedia.org");

		byte[] body = jpeg();
		List<URI> seen = new ArrayList<>();
		HttpImageFetcher fetcher = new HttpImageFetcher(uri -> {
			seen.add(uri);
			if (uri.getHost().equals("upload.wikimedia.org")) {
				return new HttpImageFetcher.Response(302, "", -1, "https://thumb.wikimedia.org/wikipedia/commons/thumb/x.jpg",
						new ByteArrayInputStream(new byte[0]));
			}
			return new HttpImageFetcher.Response(200, "image/jpeg", body.length, null, new ByteArrayInputStream(body));
		}, 1 << 20, Duration.ofSeconds(5), DEFAULTS, publicDns());

		FetchedImage image = fetcher.fetch(found.url());

		assertThat(image.ext()).isEqualTo("jpg");
		assertThat(seen).extracting(URI::getHost).containsExactly("upload.wikimedia.org", "thumb.wikimedia.org");
	}

	@Test
	void mapillaryCdnHostShapeIsAllowed() throws Exception {
		byte[] body = jpeg();
		HttpImageFetcher fetcher = new HttpImageFetcher(uri -> new HttpImageFetcher.Response(200, "image/jpeg", body.length,
				null, new ByteArrayInputStream(body)), 1 << 20, Duration.ofSeconds(5), DEFAULTS, publicDns());

		assertThat(fetcher.fetch("https://scontent.fist7-1.fna.fbcdn.net/m1/v/t6/x?stp=s2048x1024&oh=abc").ext())
			.isEqualTo("jpg");
	}

	@Test
	void rejectionMessageNamesOnlyTheHostNotThePathOrQuery() {
		HttpImageFetcher fetcher = new HttpImageFetcher(uri -> {
			throw new AssertionError();
		}, 1 << 20, Duration.ofSeconds(5), List.of("upload.wikimedia.org"), publicDns());

		assertThatThrownBy(() -> fetcher.fetch("https://evil.example/a.jpg?oh=SECRETSIG"))
			.isInstanceOf(IOException.class)
			.hasMessageContaining("evil.example")
			.message()
			.doesNotContain("SECRETSIG")
			.doesNotContain("a.jpg");
	}
}
