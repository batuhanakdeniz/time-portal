package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.timeportal.artifact.ArtifactStore;
import com.timeportal.artifact.FetchedImage;
import com.timeportal.artifact.ImageDecoder;
import com.timeportal.artifact.ImageFetcher;
import com.timeportal.depth.DepthEstimator;
import com.timeportal.depth.DepthMap;
import com.timeportal.depth.DepthNormalization;
import com.timeportal.depth.DepthPipeline;
import com.timeportal.geo.District;
import com.timeportal.geo.DistrictLocator;
import com.timeportal.image.Attribution;
import com.timeportal.image.CityImage;
import com.timeportal.image.CityImageFinder;
import com.timeportal.image.FindOutcome;
import com.timeportal.image.ImageKind;
import com.timeportal.period.PeriodBucket;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CityImageSceneGeneratorTest {

	static final District BEYOGLU = new District("İstanbul", "Beyoğlu", 41.0369, 28.985);
	static final District KONAK = new District("İzmir", "Konak", 38.4189, 27.1287);
	static final String MAPILLARY_SOURCE = "https://www.mapillary.com/app/?pKey=123";
	static final String COMMONS_SOURCE = "https://commons.wikimedia.org/wiki/File:Beyoglu.jpg";

	static class MutableClock extends Clock {
		Instant now = Instant.parse("2026-10-19T00:00:00Z");

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

	/** Çağrı sayan sahte bağımlılıklar. */
	static class Fakes {
		final AtomicInteger finds = new AtomicInteger();
		final AtomicInteger fetches = new AtomicInteger();
		final AtomicInteger estimates = new AtomicInteger();
		final List<int[]> estimateSizes = new ArrayList<>();
		volatile ImageKind kind = ImageKind.PANORAMA_360;
		volatile boolean degraded;
		volatile boolean noImage;
		volatile RuntimeException findFailure;
		volatile boolean fetchFails;
		volatile CountDownLatch findGate;
		volatile String sourceUrl = MAPILLARY_SOURCE;
		volatile String provider = Attribution.MAPILLARY;

		DistrictLocator locator = (lat, lon) -> {
			if (lat > 40) {
				return Optional.of(BEYOGLU);
			}
			if (lat > 30) {
				return Optional.of(KONAK);
			}
			return Optional.empty();
		};

		CityImageFinder finder = new CityImageFinder() {
			@Override
			public Optional<CityImage> find(District district) {
				return findDetailed(district).image();
			}

			@Override
			public FindOutcome findDetailed(District district) {
				finds.incrementAndGet();
				CountDownLatch gate = findGate;
				if (gate != null) {
					try {
						gate.await(5, TimeUnit.SECONDS);
					}
					catch (InterruptedException e) {
						Thread.currentThread().interrupt();
					}
				}
				if (findFailure != null) {
					throw findFailure;
				}
				if (noImage) {
					return new FindOutcome(Optional.empty(), false);
				}
				return new FindOutcome(Optional.of(new CityImage("https://img.test/" + district.name() + ".jpg", kind, 64, 32,
						new Attribution("Ali", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/", sourceUrl, provider))),
						degraded);
			}
		};

		ImageFetcher fetcher = url -> {
			fetches.incrementAndGet();
			if (fetchFails) {
				throw new IOException("indirilemedi");
			}
			return ImageDecoder.decode(jpeg(64, 32, url.hashCode()));
		};

		DepthEstimator estimator = image -> {
			estimates.incrementAndGet();
			synchronized (estimateSizes) {
				estimateSizes.add(new int[] {image.getWidth(), image.getHeight()});
			}
			float[] v = new float[image.getWidth() * image.getHeight()];
			for (int i = 0; i < v.length; i++) {
				v[i] = i % image.getWidth();
			}
			return new DepthMap(image.getWidth(), image.getHeight(), v);
		};
	}

	static byte[] jpeg(int w, int h, int seed) throws IOException {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < w; x++) {
				img.setRGB(x, y, ((x * 3 + seed) & 0xFF) << 8 | (y * 5 & 0xFF));
			}
		}
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, "jpg", out);
		return out.toByteArray();
	}

	@TempDir
	Path dir;

	Fakes fakes;
	MutableClock clock;
	ArtifactStore store;

	@BeforeEach
	void setUp() {
		fakes = new Fakes();
		clock = new MutableClock();
		store = new ArtifactStore(dir, 100, 100_000_000);
	}

	private CityImageSceneGenerator generator() {
		return generator(1000);
	}

	private CityImageSceneGenerator generator(int maxEntries) {
		return new CityImageSceneGenerator(fakes.locator, fakes.finder, fakes.fetcher, new DepthPipeline(fakes.estimator),
				store, clock, Duration.ofHours(24), Duration.ofMinutes(5), maxEntries);
	}

	private static SceneRequest istanbul(int year) {
		return new SceneRequest(year, 41.0369, 28.985);
	}

	@Test
	void panoramaResultCarriesKindPlaceAttributionAndStoredArtifacts() throws IOException {
		SceneResult r = generator().generate(istanbul(2026));

		assertThat(r.kind()).isEqualTo("panorama");
		assertThat(r.place()).isEqualTo(new SceneResult.Place("İstanbul", "Beyoğlu"));
		assertThat(r.attribution()).isEqualTo(new SceneResult.Attribution("Ali", "CC BY 4.0",
				"https://creativecommons.org/licenses/by/4.0/", MAPILLARY_SOURCE, "mapillary"));
		assertThat(r.panoramaUrl()).matches("/api/artifacts/[a-f0-9]{16}\\.jpg");
		assertThat(r.depthUrl()).matches("/api/artifacts/[a-f0-9]{16}-depth\\.png");
		// derinlik adı görsel özeti + normalizasyon anahtarından türer (#66)
		assertThat(r.depthUrl().substring(15)).isEqualTo(
				ArtifactStore.depthName(r.panoramaUrl().substring(15), DepthNormalization.defaults().cacheKey(true)));

		Path image = store.resolve(r.panoramaUrl().substring(15)).orElseThrow();
		Path depth = store.resolve(r.depthUrl().substring(15)).orElseThrow();
		BufferedImage img = ImageIO.read(image.toFile());
		BufferedImage dep = ImageIO.read(depth.toFile());
		assertThat(img.getWidth()).isEqualTo(64);
		assertThat(dep.getWidth()).isEqualTo(64);
		assertThat(dep.getHeight()).isEqualTo(32);
		assertThat(dep.getType()).isEqualTo(BufferedImage.TYPE_BYTE_GRAY);
		// panoramada sarmalı dolgu: 64 + 2*8
		assertThat(fakes.estimateSizes.get(0)[0]).isEqualTo(80);
	}

	@Test
	void photoResultUsesCommonsProviderAndNoPadding() {
		fakes.kind = ImageKind.PHOTO;
		fakes.sourceUrl = COMMONS_SOURCE;
		fakes.provider = Attribution.WIKIMEDIA_COMMONS;

		SceneResult r = generator().generate(istanbul(2026));

		assertThat(r.kind()).isEqualTo("photo");
		assertThat(r.attribution().provider()).isEqualTo("wikimedia-commons");
		assertThat(fakes.estimateSizes.get(0)).containsExactly(64, 32);
	}

	@Test
	void sameDistrictIsComputedOnceRegardlessOfYearOrExactPoint() {
		CityImageSceneGenerator g = generator();

		SceneResult a = g.generate(istanbul(2026));
		SceneResult b = g.generate(new SceneRequest(-44, 41.05, 28.99));

		// Görsel ilçeye bağlı; dönem istekteki yıldan gelir (#61).
		assertThat(b.withPeriod(null)).isEqualTo(a.withPeriod(null));
		assertThat(a.period().id()).isEqualTo("bugun");
		assertThat(b.period().id()).isEqualTo("helenistik");
		assertThat(fakes.finds).hasValue(1);
		assertThat(fakes.fetches).hasValue(1);
		assertThat(fakes.estimates).hasValue(1);
	}

	@Test
	void differentDistrictsAreComputedSeparately() {
		CityImageSceneGenerator g = generator();

		SceneResult a = g.generate(istanbul(2026));
		SceneResult b = g.generate(new SceneRequest(2026, 38.4189, 27.1287));

		assertThat(b.place()).isEqualTo(new SceneResult.Place("İzmir", "Konak"));
		assertThat(a.place().district()).isEqualTo("Beyoğlu");
		assertThat(fakes.estimates).hasValue(2);
	}

	@Test
	void concurrentRequestsForSameDistrictShareOneSearchAndOneInference() throws Exception {
		int n = 12;
		fakes.findGate = new CountDownLatch(1);
		CityImageSceneGenerator g = generator();
		ExecutorService pool = Executors.newFixedThreadPool(n);
		try {
			CountDownLatch ready = new CountDownLatch(n);
			List<Future<SceneResult>> futures = new ArrayList<>();
			for (int i = 0; i < n; i++) {
				int year = 2000 + i;
				futures.add(pool.submit(() -> {
					ready.countDown();
					return g.generate(istanbul(year));
				}));
			}
			assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
			Thread.sleep(150);
			fakes.findGate.countDown();
			SceneResult first = futures.get(0).get(10, TimeUnit.SECONDS);
			for (Future<SceneResult> f : futures) {
				assertThat(f.get(10, TimeUnit.SECONDS)).isEqualTo(first);
			}
		}
		finally {
			pool.shutdownNow();
		}
		assertThat(fakes.finds).hasValue(1);
		assertThat(fakes.fetches).hasValue(1);
		assertThat(fakes.estimates).hasValue(1);
	}

	@Test
	void waiterGivesUpAfterTimeoutWhileOwnerStillCompletes() throws Exception {
		fakes.findGate = new CountDownLatch(1);
		CityImageSceneGenerator g = new CityImageSceneGenerator(fakes.locator, fakes.finder, fakes.fetcher,
				new DepthPipeline(fakes.estimator), store, clock, Duration.ofHours(24), Duration.ofMinutes(5), 1000,
				Duration.ofMillis(200));
		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			Future<SceneResult> owner = pool.submit(() -> g.generate(istanbul(2026)));
			Thread.sleep(100);
			Future<SceneResult> waiter = pool.submit(() -> g.generate(istanbul(2027)));

			assertThatThrownBy(() -> waiter.get(5, TimeUnit.SECONDS)).hasRootCauseInstanceOf(IllegalStateException.class)
				.hasRootCauseMessage("timed out waiting for the scene of the same district");

			fakes.findGate.countDown();
			assertThat(owner.get(10, TimeUnit.SECONDS).kind()).isEqualTo("panorama");
		}
		finally {
			pool.shutdownNow();
		}
	}

	@Test
	void concurrentWaitersShareTheFailureAndNextRequestRetries() throws Exception {
		int n = 6;
		fakes.findGate = new CountDownLatch(1);
		fakes.findFailure = new IllegalStateException("kaynak çöktü");
		CityImageSceneGenerator g = generator();
		ExecutorService pool = Executors.newFixedThreadPool(n);
		try {
			List<Future<SceneResult>> futures = new ArrayList<>();
			for (int i = 0; i < n; i++) {
				futures.add(pool.submit(() -> g.generate(istanbul(2026))));
			}
			Thread.sleep(150);
			fakes.findGate.countDown();
			for (Future<SceneResult> f : futures) {
				assertThatThrownBy(() -> f.get(10, TimeUnit.SECONDS)).hasRootCauseMessage("kaynak çöktü");
			}
		}
		finally {
			pool.shutdownNow();
		}
		assertThat(fakes.finds).hasValue(1);

		// hata önbelleğe alınmadı: kaynak düzelince aynı ilçe yeniden denenir ve başarır
		fakes.findFailure = null;
		fakes.findGate = null;
		assertThat(g.generate(istanbul(2026)).kind()).isEqualTo("panorama");
		assertThat(fakes.finds).hasValue(2);
	}

	@Test
	void noImageThrowsNoImageFoundAndIsRetriedNextTime() {
		fakes.noImage = true;
		CityImageSceneGenerator g = generator();

		assertThatThrownBy(() -> g.generate(istanbul(2026))).isInstanceOf(NoImageFoundException.class)
			.hasMessage(CityImageFinder.NO_IMAGE_MESSAGE);
		fakes.noImage = false;
		assertThat(g.generate(istanbul(2026)).place().district()).isEqualTo("Beyoğlu");
		assertThat(fakes.finds).hasValue(2);
		assertThat(fakes.estimates).hasValue(1);
	}

	@Test
	void downloadFailureIsNotCachedAndNothingIsStored() throws IOException {
		fakes.fetchFails = true;
		CityImageSceneGenerator g = generator();

		assertThatThrownBy(() -> g.generate(istanbul(2026))).isInstanceOf(UncheckedIOException.class);
		assertThat(fakes.estimates).hasValue(0);
		try (var files = Files.list(dir)) {
			assertThat(files).isEmpty();
		}
		fakes.fetchFails = false;
		g.generate(istanbul(2026));
		assertThat(fakes.fetches).hasValue(2);
	}

	@Test
	void cachedResultExpiresAfterTtl() {
		CityImageSceneGenerator g = generator();
		g.generate(istanbul(2026));

		clock.now = clock.now.plus(Duration.ofHours(23));
		g.generate(istanbul(2026));
		assertThat(fakes.finds).hasValue(1);

		clock.now = clock.now.plus(Duration.ofHours(2));
		g.generate(istanbul(2026));
		assertThat(fakes.finds).hasValue(2);
	}

	@Test
	void degradedSearchIsCachedOnlyBriefly() {
		fakes.degraded = true;
		CityImageSceneGenerator g = generator();
		g.generate(istanbul(2026));

		clock.now = clock.now.plus(Duration.ofMinutes(4));
		g.generate(istanbul(2026));
		assertThat(fakes.finds).hasValue(1);

		clock.now = clock.now.plus(Duration.ofMinutes(2));
		g.generate(istanbul(2026));
		assertThat(fakes.finds).hasValue(2);
	}

	@Test
	void entryIsRecomputedWhenItsArtifactsWereRemovedFromDisk() throws IOException {
		CityImageSceneGenerator g = generator();
		SceneResult first = g.generate(istanbul(2026));
		Files.delete(store.resolve(first.depthUrl().substring(15)).orElseThrow());

		SceneResult second = g.generate(istanbul(2026));

		assertThat(fakes.finds).hasValue(2);
		assertThat(store.exists(second.depthUrl().substring(15))).isTrue();
	}

	@Test
	void cacheSizeIsBounded() {
		CityImageSceneGenerator g = generator(1);
		g.generate(istanbul(2026));
		clock.now = clock.now.plusSeconds(1);
		g.generate(new SceneRequest(2026, 38.4189, 27.1287));

		// sınır 1: en eski (İstanbul) atıldı, yeniden hesaplanır
		g.generate(istanbul(2026));

		assertThat(fakes.finds).hasValue(3);
	}

	@Test
	void locationOutsideDistrictsFails() {
		assertThatThrownBy(() -> generator().generate(new SceneRequest(2026, 10, 10)))
			.isInstanceOf(IllegalStateException.class);
		assertThat(fakes.finds).hasValue(0);
	}

	// --- #61: dönem ve aşamalar ---

	@Test
	void periodIsFilledFromTheRequestYear() {
		SceneResult r = generator().generate(istanbul(1453));

		assertThat(r.period()).isEqualTo(new ScenePeriod("osmanli-klasik", "Osmanlı klasik", 1453, 1700,
				PeriodBucket.Confidence.YORUM));
	}

	@Test
	void ownerReportsAllStagesInOrderAndCacheHitOnlyLocating() {
		CityImageSceneGenerator g = generator();
		List<SceneStage> first = new CopyOnWriteArrayList<>();
		List<SceneStage> second = new CopyOnWriteArrayList<>();

		g.generate(istanbul(2026), first::add);
		g.generate(istanbul(1900), second::add);

		assertThat(first).containsExactly(SceneStage.LOCATING, SceneStage.IMAGE_SEARCH, SceneStage.DEPTH,
				SceneStage.PACKAGING);
		assertThat(second).containsExactly(SceneStage.LOCATING);
	}

	@Test
	void stageListenerFailureDoesNotBreakGeneration() {
		SceneResult r = generator().generate(istanbul(2026), stage -> {
			throw new IllegalStateException("dinleyici bozuk");
		});

		assertThat(r.kind()).isEqualTo("panorama");
	}

	@Test
	void waiterMirrorsTheOwnersCurrentAndLaterStages() throws Exception {
		fakes.findGate = new CountDownLatch(1);
		CityImageSceneGenerator g = generator();
		List<SceneStage> ownerStages = new CopyOnWriteArrayList<>();
		List<SceneStage> waiterStages = new CopyOnWriteArrayList<>();
		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			Future<SceneResult> owner = pool.submit(() -> g.generate(istanbul(2026), ownerStages::add));
			long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
			while (!ownerStages.contains(SceneStage.IMAGE_SEARCH) && System.nanoTime() < deadline) {
				Thread.sleep(5);
			}
			Future<SceneResult> waiter = pool.submit(() -> g.generate(istanbul(1453), waiterStages::add));
			while (!waiterStages.contains(SceneStage.IMAGE_SEARCH) && System.nanoTime() < deadline) {
				Thread.sleep(5);
			}
			fakes.findGate.countDown();

			SceneResult o = owner.get(10, TimeUnit.SECONDS);
			SceneResult w = waiter.get(10, TimeUnit.SECONDS);
			assertThat(ownerStages).containsExactly(SceneStage.LOCATING, SceneStage.IMAGE_SEARCH, SceneStage.DEPTH,
					SceneStage.PACKAGING);
			assertThat(waiterStages).containsExactly(SceneStage.LOCATING, SceneStage.IMAGE_SEARCH, SceneStage.DEPTH,
					SceneStage.PACKAGING);
			assertThat(w.panoramaUrl()).isEqualTo(o.panoramaUrl());
			assertThat(o.period().id()).isEqualTo("bugun");
			assertThat(w.period().id()).isEqualTo("osmanli-klasik");
		}
		finally {
			pool.shutdownNow();
		}
		assertThat(fakes.finds).hasValue(1);
	}
}
