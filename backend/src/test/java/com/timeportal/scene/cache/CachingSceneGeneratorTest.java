package com.timeportal.scene.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.timeportal.scene.SceneGenerator;
import com.timeportal.scene.SceneRequest;
import com.timeportal.scene.SceneResult;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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

	@Test
	void concurrentSameKeyGeneratesOnce() throws Exception {
		int threads = 8;
		AtomicInteger calls = new AtomicInteger();
		CountDownLatch release = new CountDownLatch(1);
		SceneGenerator slow = r -> {
			calls.incrementAndGet();
			try {
				release.await(5, TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			return new SceneResult("/p.png", "/d.png");
		};
		CachingSceneGenerator cache = new CachingSceneGenerator(slow, 10);
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		try {
			CountDownLatch started = new CountDownLatch(threads);
			List<Future<SceneResult>> futures = new ArrayList<>();
			for (int i = 0; i < threads; i++) {
				futures.add(pool.submit(() -> {
					started.countDown();
					return cache.generate(req(1800));
				}));
			}
			started.await(5, TimeUnit.SECONDS);
			Thread.sleep(100);
			release.countDown();
			for (Future<SceneResult> f : futures) {
				assertThat(f.get(5, TimeUnit.SECONDS)).isEqualTo(new SceneResult("/p.png", "/d.png"));
			}
			assertThat(calls).hasValue(1);
		}
		finally {
			pool.shutdownNow();
		}
	}

	@Test
	void rejectsNonPositiveSize() {
		assertThatThrownBy(() -> new CachingSceneGenerator(new CountingGenerator(), 0))
				.isInstanceOf(IllegalArgumentException.class);
	}
}
