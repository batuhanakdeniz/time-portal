package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.timeportal.geo.District;
import com.timeportal.geo.ProvinceCenters;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class ChainedCityImageFinderTest {

	private static final String TOKEN = "MLY|999|zincirgizlisi";
	// Beyoğlu merkezi ve İstanbul il merkezi (gerçek tablo).
	private static final District BEYOGLU = new District("İstanbul", "Beyoğlu", 41.03194, 28.97611);

	private final ProvinceCenters provinces = new ProvinceCenters();
	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private final Logger logger = (Logger) LoggerFactory.getLogger(ChainedCityImageFinder.class);

	@BeforeEach
	void attachAppender() {
		logs.start();
		logger.addAppender(logs);
		logger.setLevel(Level.DEBUG);
	}

	@AfterEach
	void detachAppender() {
		logger.detachAppender(logs);
	}

	/** Çağrıları kaydeden, yanıtı yarıçapa göre belirlenen sahte kaynak. */
	private static class Scripted implements GeoImageSource {
		final boolean available;
		final List<double[]> calls = new ArrayList<>();
		java.util.function.Function<double[], Optional<CityImage>> script = c -> Optional.empty();

		Scripted(boolean available) {
			this.available = available;
		}

		@Override
		public boolean available() {
			return available;
		}

		@Override
		public Optional<CityImage> find(double latitude, double longitude, double radiusMeters) {
			double[] call = { latitude, longitude, radiusMeters };
			calls.add(call);
			return script.apply(call);
		}
	}

	private static CityImage img(String name, ImageKind kind) {
		return new CityImage("https://x.example/" + name, kind, 2048, 1024,
				new Attribution("a", "CC BY 4.0", null, "https://x.example/s/" + name));
	}

	@Test
	void step1_mapillaryPanoramaWithin300m() {
		Scripted mapillary = new Scripted(true);
		mapillary.script = c -> c[2] == 300 ? Optional.of(img("near", ImageKind.PANORAMA_360)) : Optional.empty();
		Scripted commons = new Scripted(true);

		Optional<CityImage> r = new ChainedCityImageFinder(mapillary, commons, provinces).find(BEYOGLU);

		assertThat(r).map(CityImage::url).contains("https://x.example/near");
		assertThat(mapillary.calls).hasSize(1);
		assertThat(commons.calls).isEmpty();
	}

	@Test
	void step2_mapillaryPanoramaOnlyWithin1km() {
		Scripted mapillary = new Scripted(true);
		mapillary.script = c -> c[2] == 1000 ? Optional.of(img("far", ImageKind.PANORAMA_360)) : Optional.empty();
		Scripted commons = new Scripted(true);

		Optional<CityImage> r = new ChainedCityImageFinder(mapillary, commons, provinces).find(BEYOGLU);

		assertThat(r).map(CityImage::url).contains("https://x.example/far");
		assertThat(mapillary.calls).extracting(c -> c[2]).containsExactly(300.0, 1000.0);
		assertThat(commons.calls).isEmpty();
	}

	@Test
	void step3_commonsDistrictWhenMapillaryIsEmpty() {
		Scripted mapillary = new Scripted(true);
		Scripted commons = new Scripted(true);
		commons.script = c -> Optional.of(img("ilce", ImageKind.PHOTO));

		Optional<CityImage> r = new ChainedCityImageFinder(mapillary, commons, provinces).find(BEYOGLU);

		assertThat(r).map(CityImage::url).contains("https://x.example/ilce");
		assertThat(commons.calls).hasSize(1);
		assertThat(commons.calls.get(0)[0]).isEqualTo(BEYOGLU.centerLat());
		assertThat(commons.calls.get(0)[2]).isEqualTo(1000.0);
	}

	@Test
	void step4_provinceCenterWhenDistrictHasNothing() {
		Scripted mapillary = new Scripted(true);
		Scripted commons = new Scripted(true);
		District istanbul = provinces.centerOf("İstanbul").orElseThrow();
		commons.script = c -> c[0] == istanbul.centerLat() ? Optional.of(img("il", ImageKind.PHOTO)) : Optional.empty();

		Optional<CityImage> r = new ChainedCityImageFinder(mapillary, commons, provinces).find(BEYOGLU);

		assertThat(r).map(CityImage::url).contains("https://x.example/il");
		assertThat(commons.calls).hasSize(2);
	}

	@Test
	void nothingFoundGivesEmpty() {
		Scripted mapillary = new Scripted(true);
		Scripted commons = new Scripted(true);

		assertThat(new ChainedCityImageFinder(mapillary, commons, provinces).find(BEYOGLU)).isEmpty();
		assertThat(CityImageFinder.NO_IMAGE_MESSAGE).isEqualTo("no image found for location");
	}

	@Test
	void provinceStepIsSkippedWhenDistrictCenterIsTheProvinceCenter() {
		Scripted commons = new Scripted(true);
		District same = provinces.centerOf("Hakkari").orElseThrow();

		new ChainedCityImageFinder(new Scripted(false), commons, provinces).find(same);

		assertThat(commons.calls).hasSize(1);
	}

	@Test
	void withoutTokenMapillaryIsSkippedAndWarnedOnlyOnce() {
		Scripted mapillary = new Scripted(false);
		Scripted commons = new Scripted(true);
		commons.script = c -> Optional.of(img("c", ImageKind.PHOTO));
		ChainedCityImageFinder chain = new ChainedCityImageFinder(mapillary, commons, provinces);

		chain.find(BEYOGLU);
		chain.find(BEYOGLU);
		chain.find(BEYOGLU);

		assertThat(mapillary.calls).isEmpty();
		assertThat(commons.calls).hasSize(3);
		assertThat(logs.list).filteredOn(e -> e.getLevel() == Level.WARN)
			.filteredOn(e -> e.getFormattedMessage().contains("MAPILLARY_TOKEN"))
			.hasSize(1);
	}

	@Test
	void mapillaryFailureFallsThroughToCommonsAndSkipsThe1kmRetry() {
		Scripted mapillary = new Scripted(true);
		mapillary.script = c -> {
			throw new ImageSourceException("timeout");
		};
		Scripted commons = new Scripted(true);
		commons.script = c -> Optional.of(img("c", ImageKind.PHOTO));

		Optional<CityImage> r = new ChainedCityImageFinder(mapillary, commons, provinces).find(BEYOGLU);

		assertThat(r).isPresent();
		assertThat(mapillary.calls).hasSize(1);
		assertThat(logs.list).filteredOn(e -> e.getLevel() == Level.WARN)
			.anyMatch(e -> e.getFormattedMessage().contains("timeout"));
	}

	@Test
	void commonsFailureMovesToProvinceStepAndFinallyEmpty() {
		Scripted commons = new Scripted(true);
		commons.script = c -> {
			throw new ImageSourceException("HTTP 503");
		};

		Optional<CityImage> r = new ChainedCityImageFinder(new Scripted(false), commons, provinces).find(BEYOGLU);

		assertThat(r).isEmpty();
		assertThat(commons.calls).hasSize(2);
	}

	@Test
	void tokenNeverAppearsInLogsEvenWhenTransportLeaksIt() {
		// Gerçek Mapillary kaynağı + hata mesajına anahtarı karıştıran HTTP + gerçek zincir.
		FakeHttp mapillaryHttp = FakeHttp.failing("HTTP 401 for header OAuth " + TOKEN);
		MapillaryImageSource mapillary = new MapillaryImageSource(mapillaryHttp, TOKEN);
		Scripted commons = new Scripted(true);

		new ChainedCityImageFinder(mapillary, commons, provinces).find(BEYOGLU);

		assertThat(logs.list).isNotEmpty();
		for (ILoggingEvent e : logs.list) {
			assertThat(e.getFormattedMessage()).doesNotContain(TOKEN).doesNotContain("zincirgizlisi");
			assertThat(String.valueOf(e.getThrowableProxy())).doesNotContain("zincirgizlisi");
		}
		assertThat(mapillaryHttp.requests).allSatisfy(r -> assertThat(r.url()).doesNotContain("zincirgizlisi"));
	}

	@Test
	void realSourcesEndToEndWithFixtures() {
		FakeHttp mapillaryHttp = FakeHttp.always("mapillary-empty.json");
		FakeHttp commonsHttp = FakeHttp.always("commons-mixed.json");
		ChainedCityImageFinder chain = new ChainedCityImageFinder(new MapillaryImageSource(mapillaryHttp, TOKEN),
				new WikimediaCommonsImageSource(commonsHttp), provinces);

		Optional<CityImage> r = chain.find(BEYOGLU);

		assertThat(r).map(CityImage::kind).contains(ImageKind.PHOTO);
		assertThat(mapillaryHttp.requests).isNotEmpty();
		assertThat(commonsHttp.requests).hasSize(1);
	}
}
