package com.timeportal.scene.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.timeportal.scene.SceneGenerator;
import com.timeportal.scene.SceneRequest;
import com.timeportal.scene.SceneResult;
import com.timeportal.scene.ScenePeriod;
import com.timeportal.scene.SceneStage;
import com.timeportal.scene.StageListener;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class CachingSceneGeneratorTest {

	private static SceneRequest req(int year) {
		return new SceneRequest(year, 41.9, 12.5);
	}

	/** Her çağrıda sayaç artırır; sonuç çağrı sırasını içerir. */
	static class CountingGenerator implements SceneGenerator {
		final AtomicInteger calls = new AtomicInteger();

		@Override
		public SceneResult generate(SceneRequest request) {
			int n = calls.incrementAndGet();
			return new SceneResult("/p" + n + ".png", "/d" + n + ".png");
		}
	}

	@Test
	void secondCallInSameCellDoesNotHitDelegate() {
		CountingGenerator delegate = new CountingGenerator();
		CachingSceneGenerator cache = new CachingSceneGenerator(delegate, 10);

		SceneResult first = cache.generate(new SceneRequest(1500, 41.9001, 12.5001));
		SceneResult second = cache.generate(new SceneRequest(1505, 41.8999, 12.4999));

		assertThat(second).isSameAs(first);
		assertThat(delegate.calls).hasValue(1);
	}

	@Test
	void differentKeysAreSeparate() {
		CountingGenerator delegate = new CountingGenerator();
		CachingSceneGenerator cache = new CachingSceneGenerator(delegate, 10);

		SceneResult a = cache.generate(req(2000));
		SceneResult b = cache.generate(req(2001));

		assertThat(a).isNotEqualTo(b);
		assertThat(delegate.calls).hasValue(2);
	}

	@Test
	void failuresAreNotCachedAndPropagateAsIs() {
		AtomicInteger calls = new AtomicInteger();
		IllegalStateException boom = new IllegalStateException("boom");
		SceneGenerator flaky = r -> {
			if (calls.incrementAndGet() == 1) {
				throw boom;
			}
			return new SceneResult("/p.png", "/d.png");
		};
		CachingSceneGenerator cache = new CachingSceneGenerator(flaky, 10);

		assertThatThrownBy(() -> cache.generate(req(2000))).isSameAs(boom);
		assertThat(cache.generate(req(2000))).isEqualTo(new SceneResult("/p.png", "/d.png"));
		assertThat(calls).hasValue(2);
		cache.generate(req(2000));
		assertThat(calls).hasValue(2);
	}

	@Test
	void evictsLeastRecentlyUsedWhenFull() {
		CountingGenerator delegate = new CountingGenerator();
		CachingSceneGenerator cache = new CachingSceneGenerator(delegate, 2);

		cache.generate(req(2000)); // A
		cache.generate(req(2001)); // B
		cache.generate(req(2000)); // A'ya dokun, B en eski olur
		cache.generate(req(2002)); // C -> B düşer
		assertThat(delegate.calls).hasValue(3);

		cache.generate(req(2000)); // hâlâ var
		assertThat(delegate.calls).hasValue(3);
		cache.generate(req(2001)); // düşmüştü, yeniden üretilir
		assertThat(delegate.calls).hasValue(4);
	}

	/** Öndeki iş delegede beklerken diğer iş parçacıklarının future üzerinde park ettiğini bekler. */
	private static List<Object> runConcurrently(CachingSceneGenerator cache, CountDownLatch entered,
			CountDownLatch release, int threads) throws Exception {
		Object[] outcomes = new Object[threads];
		Thread[] workers = new Thread[threads];
		for (int i = 0; i < threads; i++) {
			int idx = i;
			workers[i] = new Thread(() -> {
				try {
					outcomes[idx] = cache.generate(req(1800));
				}
				catch (Throwable t) {
					outcomes[idx] = t;
				}
			});
		}
		workers[0].start();
		assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
		for (int i = 1; i < threads; i++) {
			workers[i].start();
		}
		long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
		for (int i = 1; i < threads; i++) {
			while (workers[i].getState() != Thread.State.WAITING) {
				assertThat(System.nanoTime()).isLessThan(deadline);
				Thread.sleep(1);
			}
		}
		release.countDown();
		for (Thread w : workers) {
			w.join(5000);
			assertThat(w.isAlive()).isFalse();
		}
		return List.of(outcomes);
	}

	@Test
	void concurrentSameKeyGeneratesOnce() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		SceneResult expected = new SceneResult("/p.png", "/d.png");
		SceneGenerator slow = r -> {
			calls.incrementAndGet();
			entered.countDown();
			await(release);
			return expected;
		};
		CachingSceneGenerator cache = new CachingSceneGenerator(slow, 10);

		List<Object> outcomes = runConcurrently(cache, entered, release, 8);

		assertThat(calls).hasValue(1);
		assertThat(outcomes).hasSize(8).allMatch(expected::equals);
	}

	@Test
	void waitersGetSameExceptionAndFailureIsNotCached() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		IllegalStateException boom = new IllegalStateException("boom");
		SceneGenerator failing = r -> {
			if (calls.incrementAndGet() == 1) {
				entered.countDown();
				await(release);
				throw boom;
			}
			return new SceneResult("/p.png", "/d.png");
		};
		CachingSceneGenerator cache = new CachingSceneGenerator(failing, 10);

		List<Object> outcomes = runConcurrently(cache, entered, release, 4);

		assertThat(calls).hasValue(1);
		assertThat(outcomes).hasSize(4).allMatch(o -> o == boom);
		assertThat(cache.generate(req(1800))).isEqualTo(new SceneResult("/p.png", "/d.png"));
		assertThat(calls).hasValue(2);
	}

	@Test
	void sneakyCheckedExceptionDoesNotLeaveWaitersHanging() throws Exception {
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		Exception checked = new java.io.IOException("io");
		SceneGenerator sneaky = r -> {
			entered.countDown();
			await(release);
			return CachingSceneGeneratorTest.<RuntimeException, SceneResult>sneaky(checked);
		};
		CachingSceneGenerator cache = new CachingSceneGenerator(sneaky, 10);

		List<Object> outcomes = runConcurrently(cache, entered, release, 3);

		assertThat(outcomes).hasSize(3).allMatch(o -> o == checked);
	}

	@SuppressWarnings("unchecked")
	private static <T extends Throwable, R> R sneaky(Throwable t) throws T {
		throw (T) t;
	}

	private static void await(CountDownLatch latch) {
		try {
			latch.await(5, TimeUnit.SECONDS);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}

	@Test
	void rejectsNonPositiveSize() {
		assertThatThrownBy(() -> new CachingSceneGenerator(new CountingGenerator(), 0))
				.isInstanceOf(IllegalArgumentException.class);
	}

	// --- #61: dönem ve aşama ---

	/** Dönemi istekten dolduran ve aşama bildiren sahte delege. */
	static class PeriodGenerator implements SceneGenerator {
		final AtomicInteger calls = new AtomicInteger();

		@Override
		public SceneResult generate(SceneRequest request) {
			return generate(request, StageListener.NONE);
		}

		@Override
		public SceneResult generate(SceneRequest request, StageListener listener) {
			calls.incrementAndGet();
			listener.onStage(SceneStage.LOCATING);
			return new SceneResult("/p.png", "/d.png").withPeriod(ScenePeriod.ofYear(request.year()));
		}
	}

	@Test
	void cachedResultGetsThePeriodOfTheRequestEvenAcrossABucketBoundary() {
		PeriodGenerator delegate = new PeriodGenerator();
		CachingSceneGenerator cache = new CachingSceneGenerator(delegate, 10);

		// 1452 ve 1453 aynı on yıllık dilimde, farklı dönem kovalarında.
		SceneResult first = cache.generate(req(1452));
		SceneResult second = cache.generate(req(1453));
		SceneResult third = cache.generate(req(1451));

		assertThat(delegate.calls).hasValue(1);
		assertThat(first.period().id()).isEqualTo("selcuklu");
		assertThat(second.period().id()).isEqualTo("osmanli-klasik");
		assertThat(second.panoramaUrl()).isEqualTo(first.panoramaUrl());
		assertThat(third).isSameAs(first);
	}

	@Test
	void stageListenerReachesTheDelegateOnlyWhenItGenerates() {
		PeriodGenerator delegate = new PeriodGenerator();
		CachingSceneGenerator cache = new CachingSceneGenerator(delegate, 10);
		List<SceneStage> miss = new java.util.ArrayList<>();
		List<SceneStage> hit = new java.util.ArrayList<>();

		cache.generate(req(2026), miss::add);
		cache.generate(req(2026), hit::add);

		assertThat(miss).containsExactly(SceneStage.LOCATING);
		assertThat(hit).isEmpty();
	}
}
