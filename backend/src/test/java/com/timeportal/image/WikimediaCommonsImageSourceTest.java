package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class WikimediaCommonsImageSourceTest {

	@Test
	void filtersLicensesMimeSizeAndTopicsThenPicksClosestLandscapePhoto() {
		FakeHttp http = FakeHttp.always("commons-mixed.json");

		CityImage image = new WikimediaCommonsImageSource(http).find(41.0, 29.0, 1000).orElseThrow();

		// NC, ND, GFDL, fair use, lisanssız, SVG, 800 px, harita, logo ve dikey olanlar atlanır;
		// kalan iki yataydan geosearch sırasında öndeki (index 11) seçilir.
		assertThat(image.url()).startsWith("https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Cami_yakin.jpg/3840px-");
		assertThat(image.kind()).isEqualTo(ImageKind.PHOTO);
		assertThat(image.width()).isEqualTo(3840);
		assertThat(image.height()).isEqualTo(2560);
		assertThat(image.attribution().author()).isEqualTo("Ali & Veli");
		assertThat(image.attribution().license()).isEqualTo("CC BY-SA 3.0");
		assertThat(image.attribution().licenseUrl()).isEqualTo("https://creativecommons.org/licenses/by-sa/3.0");
		assertThat(image.attribution().sourceUrl()).isEqualTo("https://commons.wikimedia.org/wiki/File:Cami_yakin.jpg");
	}

	@Test
	void detectsEquirectangularPanoramaAndPrefersItOverCloserPhoto() {
		CityImage image = new WikimediaCommonsImageSource(FakeHttp.always("commons-pano.json")).find(41.0, 29.0, 1000)
			.orElseThrow();

		assertThat(image.kind()).isEqualTo(ImageKind.PANORAMA_360);
		assertThat(image.url()).contains("Sehir_meydani_360.jpg");
		assertThat(image.width()).isEqualTo(3840);
		assertThat(image.height()).isEqualTo(1920);
		assertThat(image.attribution().author()).isEqualTo("Foto Grafci");
	}

	@Test
	void twoToOneImageWithoutPanoramaMarkIsJustAPhoto() {
		String body = FakeHttp.fixture("commons-pano.json").replace("Equirectangular panoramas of Turkey|Pano360", "Squares in Turkey")
			.replace("Sehir meydani 360", "Sehir meydani genis");

		CityImage image = new WikimediaCommonsImageSource(new FakeHttp(u -> body)).find(41.0, 29.0, 1000).orElseThrow();

		// Pano işareti yok: sıralamada yatay fotoğraf olarak, geosearch sırasıyla (index 1) önde olan seçilir.
		assertThat(image.kind()).isEqualTo(ImageKind.PHOTO);
		assertThat(image.url()).contains("Sehir_meydani.jpg");
	}

	@Test
	void sendsDescriptiveUserAgentAndGeosearchParameters() {
		FakeHttp http = FakeHttp.always("commons-empty.json");

		assertThat(new WikimediaCommonsImageSource(http).find(41.0, 29.0, 1000)).isEmpty();

		FakeHttp.Request r = http.requests.get(0);
		assertThat(r.headers().get("User-Agent")).startsWith("time-portal/0.1 (https://github.com/batuhanakdeniz/time-portal)");
		assertThat(r.url()).contains("generator=geosearch", "ggsnamespace=6", "ggscoord=41.000000%7C29.000000",
				"ggsradius=1000", "iiurlwidth=2048", "extmetadata");
	}

	@Test
	void allowedAndRejectedLicenseNames() {
		for (String ok : new String[] { "CC0", "CC0 1.0", "Public domain", "PD-old", "CC BY 2.0", "CC BY 4.0", "CC BY-SA 3.0",
				"CC BY-SA 2.5", "CC BY-SA 3.0 de", "CC-BY-SA-4.0" }) {
			assertThat(WikimediaCommonsImageSource.isAllowedLicense(ok)).as(ok).isTrue();
		}
		for (String bad : new String[] { "GFDL", "CC BY-NC 2.0", "CC BY-NC-SA 3.0", "CC BY-ND 2.0", "CC BY-NC-ND 4.0",
				"Fair use", "", "Attribution only", "Copyrighted free use" }) {
			assertThat(WikimediaCommonsImageSource.isAllowedLicense(bad)).as(bad).isFalse();
		}
	}

	@Test
	void sourceFailureIsASourceError() {
		assertThatThrownBy(() -> new WikimediaCommonsImageSource(FakeHttp.failing("HTTP 503")).find(41.0, 29.0, 1000))
			.isInstanceOf(ImageSourceException.class)
			.hasMessageContaining("503");
		assertThatThrownBy(() -> new WikimediaCommonsImageSource(new FakeHttp(u -> "not json")).find(41.0, 29.0, 1000))
			.isInstanceOf(ImageSourceException.class);
	}

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static String q(String v) {
		return JSON.writeValueAsString(v);
	}

	/** Tek sayfalık 4000x2000 (2:1) Commons yanıtı. */
	private static String page(String title, String categories, String artist, String descriptionUrl, String licenseUrl) {
		return "{\"query\":{\"pages\":{\"1\":{\"pageid\":1,\"ns\":6,\"title\":" + q(title) + ",\"index\":1,\"imageinfo\":["
				+ "{\"thumburl\":\"https://upload.example/thumb/a/2048px-A.jpg\",\"url\":\"https://upload.example/a.jpg\","
				+ "\"descriptionurl\":" + q(descriptionUrl) + ",\"width\":4000,\"height\":2000,\"mime\":\"image/jpeg\","
				+ "\"extmetadata\":{\"LicenseShortName\":{\"value\":\"CC BY 4.0\"},\"LicenseUrl\":{\"value\":" + q(licenseUrl)
				+ "},\"Artist\":{\"value\":" + q(artist) + "},\"Categories\":{\"value\":" + q(categories) + "}}}]}}}}";
	}

	private static Optional<CityImage> find(String body) {
		return new WikimediaCommonsImageSource(new FakeHttp(u -> body)).find(41.0, 29.0, 1000);
	}

	private static final String DESC = "https://commons.wikimedia.org/wiki/File:A.jpg";
	private static final String CC = "https://creativecommons.org/licenses/by/4.0/";

	@Test
	void cleanHtmlStripsScriptTags() {
		assertThat(WikimediaCommonsImageSource.cleanHtml("Ali <script>alert(1)</script> Veli")).doesNotContain("<", ">", "script>")
			.startsWith("Ali").endsWith("Veli");
	}

	@Test
	void cleanHtmlDoesNotRevealTagsThroughEncodedEntities() {
		String r = WikimediaCommonsImageSource.cleanHtml("&lt;script&gt;alert(1)&lt;/script&gt;");

		assertThat(r).doesNotContain("<").doesNotContain(">");
		assertThat(WikimediaCommonsImageSource.cleanHtml("&amp;lt;b&amp;gt; &#60;i&#62; &#x3C;u&#x3E;")).doesNotContain("<", ">");
	}

	@Test
	void cleanHtmlDropsUnclosedTagFragments() {
		assertThat(WikimediaCommonsImageSource.cleanHtml("Foto <img src=x onerror=alert(1)")).isEqualTo("Foto");
		assertThat(WikimediaCommonsImageSource.cleanHtml("<a href=\"x\" onclick=y")).isEmpty();
	}

	@Test
	void cleanHtmlHandlesNestedTagsAndEntities() {
		assertThat(WikimediaCommonsImageSource.cleanHtml("<div><a href=\"https://x\"><b>Ali</b> &amp; <i>Veli</i></a></div>"))
			.isEqualTo("Ali & Veli");
		assertThat(WikimediaCommonsImageSource.cleanHtml("<<b>>x<</b>>")).doesNotContain("<", ">");
	}

	@Test
	void cleanHtmlCapsLength() {
		String r = WikimediaCommonsImageSource.cleanHtml("<b>" + "a".repeat(5000) + "</b>");

		assertThat(r).hasSize(WikimediaCommonsImageSource.MAX_AUTHOR_CHARS);
	}

	@Test
	void nonHttpsLicenseUrlIsDroppedAndNonHttpsSourceCandidateIsRejected() {
		CityImage ok = find(page("File:A.jpg", "Turkey", "Ali", DESC, "javascript:alert(1)")).orElseThrow();
		assertThat(ok.attribution().licenseUrl()).isNull();
		assertThat(find(page("File:A.jpg", "Turkey", "Ali", DESC, "http://creativecommons.org/x")).orElseThrow()
			.attribution().licenseUrl()).isNull();
		assertThat(find(page("File:A.jpg", "Turkey", "Ali", DESC, CC)).orElseThrow().attribution().licenseUrl()).isEqualTo(CC);

		assertThat(find(page("File:A.jpg", "Turkey", "Ali", "http://commons.wikimedia.org/wiki/File:A.jpg", CC))).isEmpty();
		assertThat(find(page("File:A.jpg", "Turkey", "Ali", "javascript:alert(1)", CC))).isEmpty();
	}

	@Test
	void imageUrlMustBeHttps() {
		String body = page("File:A.jpg", "Turkey", "Ali", DESC, CC).replace("https://upload.example/thumb/a/2048px-A.jpg",
				"http://upload.example/thumb/a/2048px-A.jpg");

		assertThat(find(body)).isEmpty();
	}

	@Test
	void panoramaNeedsASpecificMarkNotJustTheNumber360() {
		assertThat(find(page("File:Route 360.jpg", "Roads in Turkey", "Ali", DESC, CC)).orElseThrow().kind())
			.isEqualTo(ImageKind.PHOTO);
		assertThat(find(page("File:A.jpg", "360° panoramas of Turkey", "Ali", DESC, CC)).orElseThrow().kind())
			.isEqualTo(ImageKind.PANORAMA_360);
		assertThat(find(page("File:A 360 degree view.jpg", "Turkey", "Ali", DESC, CC)).orElseThrow().kind())
			.isEqualTo(ImageKind.PANORAMA_360);
		assertThat(find(page("File:A.jpg", "Photosphere images", "Ali", DESC, CC)).orElseThrow().kind())
			.isEqualTo(ImageKind.PANORAMA_360);
	}

	@Test
	void krokiPosterAndScreenshotAreExcluded() {
		for (String bad : new String[] { "File:Kroki ilce.jpg", "File:Konser poster.jpg", "File:Game screenshot.jpg" }) {
			assertThat(find(page(bad, "Turkey", "Ali", DESC, CC))).as(bad).isEmpty();
		}
		assertThat(find(page("File:A.jpg", "Posters of Turkey", "Ali", DESC, CC))).isEmpty();
	}

	@Test
	void authorIsSanitizedAndCapped() {
		CityImage image = find(page("File:A.jpg", "Turkey", "<a href=\"x\">" + "b".repeat(1000) + "</a><script>x", DESC, CC))
			.orElseThrow();

		assertThat(image.attribution().author()).hasSize(WikimediaCommonsImageSource.MAX_AUTHOR_CHARS).doesNotContain("<", ">");
	}
}
