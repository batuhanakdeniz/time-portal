package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class MapillaryImageSourceTest {

	private static final double LAT = 41.0;
	private static final double LON = 29.0;
	private static final String TOKEN = "MLY|123456|supersecretvalue";

	@Test
	void picksNearestPanoramaWithin300m() {
		FakeHttp http = FakeHttp.always("mapillary-near.json");
		MapillaryImageSource source = new MapillaryImageSource(http, TOKEN);

		CityImage image = source.find(LAT, LON, 300).orElseThrow();

		assertThat(image.url()).isEqualTo("https://scontent.example/nearest-100m.jpg");
		assertThat(image.kind()).isEqualTo(ImageKind.PANORAMA_360);
		assertThat(image.width()).isEqualTo(2048);
		assertThat(image.height()).isEqualTo(1024);
		assertThat(image.attribution().author()).isEqualTo("© Mapillary katkıcıları, yakin_kullanici");
		assertThat(image.attribution().license()).isEqualTo("CC BY-SA 4.0");
		assertThat(image.attribution().licenseUrl()).isEqualTo("https://creativecommons.org/licenses/by-sa/4.0/");
		assertThat(image.attribution().sourceUrl()).isEqualTo("https://www.mapillary.com/app/?pKey=1003");
	}

	@Test
	void ignoresPanoramaBeyondRadiusAndNonPanoramas() {
		MapillaryImageSource source = new MapillaryImageSource(FakeHttp.always("mapillary-far.json"), TOKEN);

		assertThat(source.find(LAT, LON, 300)).isEmpty();
		assertThat(source.find(LAT, LON, 1000)).isPresent();
	}

	@Test
	void emptyResponseGivesEmpty() {
		MapillaryImageSource source = new MapillaryImageSource(FakeHttp.always("mapillary-empty.json"), TOKEN);

		assertThat(source.find(LAT, LON, 1000)).isEmpty();
	}

	@Test
	void sendsTokenOnlyInAuthorizationHeaderNeverInUrl() {
		FakeHttp http = FakeHttp.always("mapillary-near.json");

		new MapillaryImageSource(http, TOKEN).find(LAT, LON, 300);

		assertThat(http.requests).isNotEmpty().allSatisfy(r -> {
			assertThat(r.headers()).containsEntry("Authorization", "OAuth " + TOKEN);
			assertThat(r.url()).doesNotContain("MLY").doesNotContain("access_token").contains("is_pano=true")
				.startsWith("https://graph.mapillary.com/images?");
		});
	}

	@Test
	void largeRadiusIsSplitIntoCellsBelowTheApiLimit() {
		FakeHttp http = FakeHttp.always("mapillary-empty.json");

		new MapillaryImageSource(http, TOKEN).find(LAT, LON, 1000);

		Pattern bbox = Pattern.compile("bbox=(-?[\\d.]+),(-?[\\d.]+),(-?[\\d.]+),(-?[\\d.]+)");
		assertThat(http.requests.size()).isGreaterThan(1);
		for (FakeHttp.Request r : http.requests) {
			Matcher m = bbox.matcher(r.url());
			assertThat(m.find()).isTrue();
			assertThat(Double.parseDouble(m.group(3)) - Double.parseDouble(m.group(1))).isLessThan(0.01);
			assertThat(Double.parseDouble(m.group(4)) - Double.parseDouble(m.group(2))).isLessThan(0.01);
		}
	}

	@Test
	void unavailableWithoutToken() {
		assertThat(new MapillaryImageSource(FakeHttp.always("mapillary-near.json"), "").available()).isFalse();
		assertThat(new MapillaryImageSource(FakeHttp.always("mapillary-near.json"), null).available()).isFalse();
		assertThat(new MapillaryImageSource(FakeHttp.always("mapillary-near.json"), TOKEN).available()).isTrue();
	}

	@Test
	void errorMessagesNeverContainTheToken() {
		// İletim katmanı hata mesajına anahtarı karıştırsa bile sızmamalı.
		MapillaryImageSource source = new MapillaryImageSource(FakeHttp.failing("HTTP 500 for OAuth " + TOKEN), TOKEN);

		assertThatThrownBy(() -> source.find(LAT, LON, 300)).isInstanceOf(ImageSourceException.class)
			.satisfies(e -> {
				assertThat(e.getMessage()).doesNotContain(TOKEN).doesNotContain("supersecretvalue");
				assertThat(e.getCause()).isNull();
			});
		assertThat(source.toString()).doesNotContain("supersecretvalue");
	}

	@Test
	void malformedJsonIsASourceError() {
		MapillaryImageSource source = new MapillaryImageSource(new FakeHttp(url -> "<html>oops"), TOKEN);

		assertThatThrownBy(() -> source.find(LAT, LON, 300)).isInstanceOf(ImageSourceException.class);
	}

	private static final String REDUCE_DATA = "{\"error\":{\"message\":\"Please reduce the amount of data you're asking for, then retry your request\",\"type\":\"OAuthException\",\"code\":1}}";

	private static double span(String url) {
		Matcher m = Pattern.compile("bbox=(-?[\\d.]+),(-?[\\d.]+),(-?[\\d.]+),(-?[\\d.]+)").matcher(url);
		assertThat(m.find()).isTrue();
		return Double.parseDouble(m.group(3)) - Double.parseDouble(m.group(1));
	}

	@Test
	void reduceDataErrorShrinksTheBboxAndRetries() {
		String ok = FakeHttp.fixture("mapillary-near.json");
		FakeHttp http = new FakeHttp(url -> {
			if (span(url) > 0.002) {
				throw new FakeHttp.StatusSignal(500, REDUCE_DATA);
			}
			return ok;
		});

		CityImage image = new MapillaryImageSource(http, TOKEN).find(LAT, LON, 300).orElseThrow();

		assertThat(image.url()).isEqualTo("https://scontent.example/nearest-100m.jpg");
		assertThat(http.requests.stream().filter(r -> span(r.url()) > 0.002)).isNotEmpty();
		assertThat(http.requests.stream().filter(r -> span(r.url()) <= 0.002)).isNotEmpty();
	}

	@Test
	void persistentReduceDataErrorEventuallyGivesUpAsASourceError() {
		FakeHttp http = new FakeHttp(url -> {
			throw new FakeHttp.StatusSignal(500, REDUCE_DATA);
		});

		assertThatThrownBy(() -> new MapillaryImageSource(http, TOKEN).find(LAT, LON, 300))
			.isInstanceOf(ImageSourceException.class);
		assertThat(http.requests.size()).isLessThan(200);
	}

	@Test
	void otherServerErrorsAreNotRetriedAsShrink() {
		FakeHttp http = new FakeHttp(url -> {
			throw new FakeHttp.StatusSignal(500,
					"{\"error\":{\"message\":\"Service temporarily unavailable\",\"code\":2}}");
		});

		assertThatThrownBy(() -> new MapillaryImageSource(http, TOKEN).find(LAT, LON, 300))
			.isInstanceOf(ImageSourceException.class)
			.hasMessageContaining("HTTP 500");
		assertThat(http.requests).hasSize(1);
	}

	@Test
	void farCellsAreSkippedOnceANearerPanoramaIsKnown() {
		FakeHttp http = FakeHttp.always("mapillary-near.json");

		new MapillaryImageSource(http, TOKEN).find(LAT, LON, 1000);

		// 1 km'lik alanda onlarca hücre var; en yakın pano ~100 m'de bulununca uzak hücreler sorulmaz.
		assertThat(http.requests.size()).isLessThan(10);
	}
}
