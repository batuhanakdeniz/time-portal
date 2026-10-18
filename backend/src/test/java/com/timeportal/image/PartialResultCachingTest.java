package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;

import com.timeportal.geo.District;
import com.timeportal.geo.ProvinceCenters;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** Kısmi Mapillary sonucu (hücre hatası / bütçe) kısa TTL ile, tam tarama uzun TTL ile önbelleğe girer. */
class PartialResultCachingTest {

	private static final String TOKEN = "MLY|7|kismisizinti";
	private static final District D = new District("İstanbul", "Beyoğlu", 41.0, 29.0);

	private static class MutableClock extends Clock {
		Instant now = Instant.parse("2026-10-19T10:00:00Z");

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

	private static final GeoImageSource NO_COMMONS = new GeoImageSource() {
		@Override
		public Optional<CityImage> find(double latitude, double longitude, double radiusMeters) {
			return Optional.empty();
		}
	};

	private static CachingCityImageFinder cache(GeoImageSource mapillary, MutableClock clock, Duration budget) {
		ChainedCityImageFinder chain = new ChainedCityImageFinder(mapillary, NO_COMMONS, new ProvinceCenters(), clock, budget);
		return new CachingCityImageFinder(chain, clock, Duration.ofHours(24), Duration.ofHours(12), Duration.ofMinutes(5),
				Duration.ofMinutes(5), 10);
	}

	@Test
	void swallowedCellErrorMakesTheChainDegradedAndCacheShort() {
		MutableClock clock = new MutableClock();
		String near = FakeHttp.fixture("mapillary-near.json");
		AtomicInteger n = new AtomicInteger();
		FakeHttp http = new FakeHttp(u -> {
			if (n.incrementAndGet() == 1) {
				return near;
			}
			throw new FakeHttp.StatusSignal(503, "x");
		});
		CachingCityImageFinder cache = cache(new MapillaryImageSource(http, TOKEN), clock, Duration.ofSeconds(25));

		assertThat(cache.find(D)).isPresent();
		int afterFirst = http.requests.size();
		clock.now = clock.now.plus(Duration.ofMinutes(1));
		cache.find(D);
		assertThat(http.requests).hasSize(afterFirst);
		clock.now = clock.now.plus(Duration.ofMinutes(6));
		cache.find(D);
		assertThat(http.requests.size()).isGreaterThan(afterFirst);
	}

	@Test
	void scanCutShortByTheTimeBudgetIsCachedShortAndFlaggedDegraded() {
		MutableClock clock = new MutableClock();
		String near = FakeHttp.fixture("mapillary-near.json");
		FakeHttp http = new FakeHttp(u -> {
			clock.now = clock.now.plusSeconds(3);
			return near;
		});
		MapillaryImageSource source = new MapillaryImageSource(http, TOKEN);
		ChainedCityImageFinder chain = new ChainedCityImageFinder(source, NO_COMMONS, new ProvinceCenters(), clock,
				Duration.ofSeconds(5));

		FindOutcome outcome = chain.findDetailed(D);

		assertThat(outcome.image()).isPresent();
		assertThat(outcome.degraded()).isTrue();

		clock.now = Instant.parse("2026-10-19T10:00:00Z");
		CachingCityImageFinder cache = cache(source, clock, Duration.ofSeconds(5));
		cache.find(D);
		int count = http.requests.size();
		clock.now = clock.now.plus(Duration.ofMinutes(6));
		cache.find(D);
		assertThat(http.requests.size()).isGreaterThan(count);
	}

	@Test
	void completeScanIsNotDegradedAndKeepsTheLongTtl() {
		MutableClock clock = new MutableClock();
		FakeHttp http = FakeHttp.always("mapillary-near.json");
		MapillaryImageSource source = new MapillaryImageSource(http, TOKEN);
		ChainedCityImageFinder chain = new ChainedCityImageFinder(source, NO_COMMONS, new ProvinceCenters(), clock,
				Duration.ofSeconds(25));
		assertThat(chain.findDetailed(D).degraded()).isFalse();

		CachingCityImageFinder cache = cache(source, clock, Duration.ofSeconds(25));
		cache.find(D);
		int count = http.requests.size();
		clock.now = clock.now.plus(Duration.ofHours(23));
		cache.find(D);
		assertThat(http.requests).hasSize(count);
	}
}
