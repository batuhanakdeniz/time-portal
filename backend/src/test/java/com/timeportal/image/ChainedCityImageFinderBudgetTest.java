package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.timeportal.geo.District;
import com.timeportal.geo.ProvinceCenters;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/** Toplam süre bütçesi ve "geçici hata" (degraded) bilgisi. */
class ChainedCityImageFinderBudgetTest {

	private static final String TOKEN = "MLY|999|butcegizlisi";
	private static final District BEYOGLU = new District("İstanbul", "Beyoğlu", 41.03194, 28.97611);

	private final ProvinceCenters provinces = new ProvinceCenters();
	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
	private final Logger logger = (Logger) LoggerFactory.getLogger(ChainedCityImageFinder.class);

	@BeforeEach
	void attachAppender() {
		logs.start();
		logger.addAppender(logs);
	}

	@AfterEach
	void detachAppender() {
		logger.detachAppender(logs);
	}

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

	private static class Scripted implements GeoImageSource {
		final boolean available;
		final List<double[]> calls = new ArrayList<>();
		Function<double[], Optional<CityImage>> script = c -> Optional.empty();

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

	private static CityImage img(String name) {
		return new CityImage("https://x.example/" + name, ImageKind.PHOTO, 2048, 1024,
				new Attribution("a", "CC BY 4.0", null, "https://x.example/s/" + name));
	}

	@Test
	void totalTimeBudgetSkipsRemainingStepsAndReturnsInTime() {
		MutableClock clock = new MutableClock();
		Scripted mapillary = new Scripted(true);
		mapillary.script = c -> {
			clock.now = clock.now.plusSeconds(10);
			return Optional.empty();
		};
		Scripted commons = new Scripted(true);
		commons.script = c -> {
			clock.now = clock.now.plusSeconds(10);
			return Optional.empty();
		};
		ChainedCityImageFinder chain = new ChainedCityImageFinder(mapillary, commons, provinces, clock, Duration.ofSeconds(25));

		FindOutcome outcome = chain.findDetailed(BEYOGLU);

		// Mapillary 10 + 10 sn; Commons ilçe adımı 20. sn'de başlar (30'da biter); il adımı atlanır.
		assertThat(mapillary.calls).hasSize(2);
		assertThat(commons.calls).hasSize(1);
		assertThat(outcome.image()).isEmpty();
		assertThat(outcome.degraded()).isTrue();
		assertThat(logs.list).anyMatch(e -> e.getLevel() == Level.WARN && e.getFormattedMessage().contains("budget"));
	}

	@Test
	void budgetAlreadyExhaustedByMapillarySkipsCommonsEntirely() {
		MutableClock clock = new MutableClock();
		Scripted mapillary = new Scripted(true);
		mapillary.script = c -> {
			clock.now = clock.now.plusSeconds(30);
			return Optional.empty();
		};
		Scripted commons = new Scripted(true);
		commons.script = c -> Optional.of(img("c"));

		FindOutcome outcome = new ChainedCityImageFinder(mapillary, commons, provinces, clock, Duration.ofSeconds(25))
			.findDetailed(BEYOGLU);

		assertThat(mapillary.calls).hasSize(1);
		assertThat(commons.calls).isEmpty();
		assertThat(outcome.image()).isEmpty();
		assertThat(outcome.degraded()).isTrue();
	}

	@Test
	void slowMapillaryCellsStopWhenTheBudgetRunsOut() {
		MutableClock clock = new MutableClock();
		FakeHttp slow = new FakeHttp(u -> {
			clock.now = clock.now.plusSeconds(1);
			return FakeHttp.fixture("mapillary-empty.json");
		});
		Scripted commons = new Scripted(true);
		ChainedCityImageFinder chain = new ChainedCityImageFinder(new MapillaryImageSource(slow, TOKEN), commons, provinces,
				clock, Duration.ofSeconds(5));

		FindOutcome outcome = chain.findDetailed(BEYOGLU);

		assertThat(slow.requests.size()).isLessThanOrEqualTo(5);
		assertThat(commons.calls).isEmpty();
		assertThat(outcome.image()).isEmpty();
		assertThat(outcome.degraded()).isTrue();
	}

	@Test
	void realClockBudgetReturnsPromptlyWithSlowHttp() {
		FakeHttp slow = new FakeHttp(u -> {
			try {
				Thread.sleep(40);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			return FakeHttp.fixture("mapillary-empty.json");
		});
		Scripted commons = new Scripted(true);
		ChainedCityImageFinder chain = new ChainedCityImageFinder(new MapillaryImageSource(slow, TOKEN), commons, provinces,
				Clock.systemUTC(), Duration.ofMillis(150));

		long start = System.nanoTime();
		FindOutcome outcome = chain.findDetailed(BEYOGLU);
		long elapsedMs = (System.nanoTime() - start) / 1_000_000;

		assertThat(elapsedMs).isLessThan(1000);
		assertThat(slow.requests.size()).isLessThan(10);
		assertThat(outcome.degraded()).isTrue();
	}

	@Test
	void sourceFailureMakesTheOutcomeDegradedEvenWhenCommonsFindsSomething() {
		Scripted mapillary = new Scripted(true);
		mapillary.script = c -> {
			throw new ImageSourceException("timeout");
		};
		Scripted commons = new Scripted(true);
		commons.script = c -> Optional.of(img("c"));

		FindOutcome outcome = new ChainedCityImageFinder(mapillary, commons, provinces).findDetailed(BEYOGLU);

		assertThat(outcome.image()).isPresent();
		assertThat(outcome.degraded()).isTrue();
	}

	@Test
	void healthyRunIsNotDegradedAndFindStillWorks() {
		Scripted commons = new Scripted(true);
		commons.script = c -> Optional.of(img("c"));
		ChainedCityImageFinder chain = new ChainedCityImageFinder(new Scripted(false), commons, provinces);

		assertThat(chain.findDetailed(BEYOGLU).degraded()).isFalse();
		assertThat(chain.find(BEYOGLU)).isPresent();
		assertThat(new ChainedCityImageFinder(new Scripted(true), new Scripted(true), provinces).findDetailed(BEYOGLU)
			.degraded()).isFalse();
	}

	@Test
	void totalTimeoutMustBePositive() {
		assertThatThrownBy(() -> new ChainedCityImageFinder(new Scripted(true), new Scripted(true), provinces,
				Clock.systemUTC(), Duration.ZERO)).isInstanceOf(IllegalArgumentException.class);
	}
}
