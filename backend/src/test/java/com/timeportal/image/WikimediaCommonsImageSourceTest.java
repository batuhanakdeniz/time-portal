package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

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
}
