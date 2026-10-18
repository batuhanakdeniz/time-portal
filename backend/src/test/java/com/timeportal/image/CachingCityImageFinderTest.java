package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.timeportal.geo.District;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class CachingCityImageFinderTest {

	private static final District A = new District("Ankara", "Çankaya", 39.86, 32.84);
	private static final District B = new District("Ankara", "Mamak", 39.92, 32.91);

	private static class MutableClock extends Clock {
		Instant now = Instant.parse("2026-10-18T10:00:00Z");

		@Override
		public ZoneOffset getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

	private static CityImage image(String source) {
		return new CityImage("https://x/i.jpg", ImageKind.PHOTO, 2048, 1024, new Attribution("a", "CC0", null, source));
	}

	private static class Counting implements CityImageFinder {
		final AtomicInteger calls = new AtomicInteger();
		Optional<CityImage> result;

		Counting(Optional<CityImage> result) {
			this.result = result;
		}

		@Override
		public Optional<CityImage> find(District district) {
			calls.incrementAndGet();
			return result;
		}
	}

	private CachingCityImageFinder cache(CityImageFinder delegate, MutableClock clock) {
		return new CachingCityImageFinder(delegate, clock, Duration.ofMinutes(30), Duration.ofHours(12),
				Duration.ofMinutes(5), 10);
	}

	@Test
	void secondCallForSameDistrictDoesNotHitTheNetwork() {
		Counting delegate = new Counting(Optional.of(image("https://commons.wikimedia.org/wiki/File:X.jpg")));
		CachingCityImageFinder cache = cache(delegate, new MutableClock());

		Optional<CityImage> first = cache.find(A);
		Optional<CityImage> second = cache.find(new District("Ankara", "Çankaya", 1, 1));
		cache.find(B);

		assertThat(second).isEqualTo(first);
		assertThat(delegate.calls).hasValue(2);
	}

	@Test
	void emptyResultIsCachedBrieflyThenRetried() {
		MutableClock clock = new MutableClock();
		Counting delegate = new Counting(Optional.empty());
		CachingCityImageFinder cache = cache(delegate, clock);

		cache.find(A);
		cache.find(A);
		assertThat(delegate.calls).hasValue(1);

		clock.now = clock.now.plus(Duration.ofMinutes(6));
		delegate.result = Optional.of(image("https://commons.wikimedia.org/wiki/File:Y.jpg"));
		assertThat(cache.find(A)).isPresent();
		assertThat(delegate.calls).hasValue(2);
	}

	@Test
	void mapillaryResultsExpireSoonerThanCommonsResults() {
		MutableClock clock = new MutableClock();
		Counting mapillary = new Counting(Optional.of(image("https://www.mapillary.com/app/?pKey=1")));
		Counting commons = new Counting(Optional.of(image("https://commons.wikimedia.org/wiki/File:Z.jpg")));
		CachingCityImageFinder mapillaryCache = cache(mapillary, clock);
		CachingCityImageFinder commonsCache = cache(commons, clock);
		mapillaryCache.find(A);
		commonsCache.find(A);

		clock.now = clock.now.plus(Duration.ofMinutes(31));
		mapillaryCache.find(A);
		commonsCache.find(A);

		assertThat(mapillary.calls).hasValue(2);
		assertThat(commons.calls).hasValue(1);
	}

	@Test
	void sizeIsBounded() {
		Counting delegate = new Counting(Optional.empty());
		CachingCityImageFinder cache = new CachingCityImageFinder(delegate, new MutableClock(), Duration.ofHours(1),
				Duration.ofHours(1), Duration.ofHours(1), 2);

		cache.find(A);
		cache.find(B);
		cache.find(new District("Ankara", "Yenimahalle", 39.9, 32.8));
		cache.find(A);

		assertThat(delegate.calls).hasValue(4);
		assertThatThrownBy(() -> new CachingCityImageFinder(delegate, new MutableClock(), Duration.ZERO, Duration.ZERO,
				Duration.ZERO, 0)).isInstanceOf(IllegalArgumentException.class);
	}

	private static class Degraded implements CityImageFinder {
		final AtomicInteger calls = new AtomicInteger();
		boolean degraded = true;
		Optional<CityImage> result;

		Degraded(Optional<CityImage> result) {
			this.result = result;
		}

		@Override
		public Optional<CityImage> find(District district) {
			return findDetailed(district).image();
		}

		@Override
		public FindOutcome findDetailed(District district) {
			calls.incrementAndGet();
			return new FindOutcome(result, degraded);
		}
	}

	private CachingCityImageFinder cacheWithTransient(CityImageFinder delegate, MutableClock clock) {
		return new CachingCityImageFinder(delegate, clock, Duration.ofMinutes(30), Duration.ofHours(12),
				Duration.ofMinutes(10), Duration.ofMinutes(2), 10);
	}

	@Test
	void degradedCommonsResultIsCachedOnlyBriefly() {
		MutableClock clock = new MutableClock();
		Degraded delegate = new Degraded(Optional.of(image("https://commons.wikimedia.org/wiki/File:Z.jpg")));
		CachingCityImageFinder cache = cacheWithTransient(delegate, clock);

		cache.find(A);
		clock.now = clock.now.plus(Duration.ofMinutes(1));
		cache.find(A);
		assertThat(delegate.calls).hasValue(1);

		clock.now = clock.now.plus(Duration.ofMinutes(2));
		cache.find(A);
		assertThat(delegate.calls).hasValue(2);
	}

	@Test
	void degradedEmptyResultUsesTheTransientTtlAndHealthyOnesKeepLongTtl() {
		MutableClock clock = new MutableClock();
		Degraded delegate = new Degraded(Optional.empty());
		CachingCityImageFinder cache = cacheWithTransient(delegate, clock);
		cache.find(A);
		clock.now = clock.now.plus(Duration.ofMinutes(3));
		cache.find(A);
		assertThat(delegate.calls).hasValue(2);

		Degraded healthy = new Degraded(Optional.of(image("https://commons.wikimedia.org/wiki/File:Z.jpg")));
		healthy.degraded = false;
		CachingCityImageFinder cache2 = cacheWithTransient(healthy, clock);
		cache2.find(A);
		clock.now = clock.now.plus(Duration.ofHours(11));
		cache2.find(A);
		assertThat(healthy.calls).hasValue(1);
	}
}
