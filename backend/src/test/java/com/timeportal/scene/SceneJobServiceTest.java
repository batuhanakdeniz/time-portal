package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Queue;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SceneJobServiceTest {

	/** Görevleri hemen çalıştırmaz, testin adım adım ilerletmesine izin verir. */
	static class ManualExecutor implements Executor {
		final Queue<Runnable> tasks = new ArrayDeque<>();

		@Override
		public void execute(Runnable command) {
			tasks.add(command);
		}

		void runNext() {
			tasks.remove().run();
		}
	}

	/** Elle ilerletilen saat. */
	static class MutableClock extends Clock {
		Instant now = Instant.parse("2026-01-01T00:00:00Z");

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

		void advance(Duration d) {
			now = now.plus(d);
		}
	}

	private static final SceneRequest REQUEST = new SceneRequest(-44, 41.9, 12.5);
	private static final SceneResult RESULT = new SceneResult("/api/samples/p.png", "/api/samples/d.png");
	private static final Duration TTL = Duration.ofHours(1);

	private ManualExecutor executor;

	@BeforeEach
	void setUp() {
		executor = new ManualExecutor();
	}

	@Test
	void jobMovesPendingToReady() {
		SceneJobService service = new SceneJobService(request -> RESULT, executor);

		SceneJob created = service.create(REQUEST);
		assertThat(created.status()).isEqualTo(SceneStatus.PENDING);
		assertThat(service.find(created.id())).get().extracting(SceneJob::status).isEqualTo(SceneStatus.PENDING);

		executor.runNext();

		SceneJob done = service.find(created.id()).orElseThrow();
		assertThat(done.status()).isEqualTo(SceneStatus.READY);
		assertThat(done.result()).isEqualTo(RESULT);
		assertThat(done.error()).isNull();
		assertThat(done.finishedAt()).isNotNull();
	}

	@Test
	void jobIsRunningWhileGeneratorWorks() {
		SceneJobService[] holder = new SceneJobService[1];
		SceneStatus[] seen = new SceneStatus[1];
		String[] id = new String[1];
		holder[0] = new SceneJobService(request -> {
			seen[0] = holder[0].find(id[0]).orElseThrow().status();
			return RESULT;
		}, executor);

		id[0] = holder[0].create(REQUEST).id();
		executor.runNext();

		assertThat(seen[0]).isEqualTo(SceneStatus.RUNNING);
	}

	@Test
	void generatorFailureMarksJobFailedWithGenericMessage() {
		SceneJobService service = new SceneJobService(request -> {
			throw new IllegalStateException("servis kapalı");
		}, executor);

		SceneJob created = service.create(REQUEST);
		executor.runNext();

		SceneJob failed = service.find(created.id()).orElseThrow();
		assertThat(failed.status()).isEqualTo(SceneStatus.FAILED);
		assertThat(failed.result()).isNull();
		assertThat(failed.error()).isEqualTo("generation failed").doesNotContain("servis kapalı");
	}

	@Test
	void noImageFoundFailsWithTheImageMessageInsteadOfTheGenericOne() {
		SceneJobService service = new SceneJobService(request -> {
			throw new NoImageFoundException();
		}, executor);

		SceneJob created = service.create(REQUEST);
		executor.runNext();

		SceneJob failed = service.find(created.id()).orElseThrow();
		assertThat(failed.status()).isEqualTo(SceneStatus.FAILED);
		assertThat(failed.error()).isEqualTo("no image found for location");
	}

	@Test
	void errorThrownByGeneratorAlsoMarksJobFailed() {
		SceneJobService service = new SceneJobService(request -> {
			throw new NoClassDefFoundError("adapter");
		}, executor);

		SceneJob created = service.create(REQUEST);
		executor.runNext();

		SceneJob failed = service.find(created.id()).orElseThrow();
		assertThat(failed.status()).isEqualTo(SceneStatus.FAILED);
		assertThat(failed.error()).isEqualTo("generation failed");
	}

	@Test
	void unknownJobIsEmpty() {
		SceneJobService service = new SceneJobService(request -> RESULT, executor);
		assertThat(service.find("yok")).isEmpty();
	}

	@Test
	void eachJobGetsOwnId() {
		SceneJobService service = new SceneJobService(request -> RESULT, executor);
		String first = service.create(REQUEST).id();
		String second = service.create(REQUEST).id();
		assertThat(first).isNotEqualTo(second);
		assertThat(service.find(first)).isPresent();
		assertThat(service.find(second)).isPresent();
	}

	@Test
	void illegalTransitionsAreRejected() {
		Instant now = Instant.now();
		SceneJob pending = SceneJob.pending("a", REQUEST, now);
		assertThatThrownBy(() -> pending.ready(RESULT, now)).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> pending.failed("x", now)).isInstanceOf(IllegalStateException.class);

		SceneJob ready = pending.running().ready(RESULT, now);
		assertThatThrownBy(ready::running).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void finishedJobsAreRemovedAfterTtl() {
		MutableClock clock = new MutableClock();
		SceneJobService service = new SceneJobService(request -> {
			if (request.year() == 1) {
				throw new IllegalStateException("x");
			}
			return RESULT;
		}, executor, clock, TTL, 10);
		String ready = service.create(REQUEST).id();
		String failed = service.create(new SceneRequest(1, 1, 1)).id();
		executor.runNext();
		executor.runNext();
		assertThat(service.find(ready).orElseThrow().status()).isEqualTo(SceneStatus.READY);
		assertThat(service.find(failed).orElseThrow().status()).isEqualTo(SceneStatus.FAILED);

		clock.advance(TTL.minusSeconds(1));
		assertThat(service.find(ready)).isPresent();

		clock.advance(Duration.ofSeconds(1));
		assertThat(service.find(ready)).isEmpty();
		assertThat(service.find(failed)).isEmpty();

		service.create(REQUEST);
		assertThat(service.size()).isEqualTo(1);
	}

	@Test
	void pendingAndRunningJobsAreNeverRemoved() {
		MutableClock clock = new MutableClock();
		SceneJobService[] holder = new SceneJobService[1];
		String[] id = new String[1];
		boolean[] runningSurvived = new boolean[1];
		holder[0] = new SceneJobService(request -> {
			clock.advance(Duration.ofDays(2));
			holder[0].sweep();
			runningSurvived[0] = holder[0].find(id[0]).isPresent();
			return RESULT;
		}, executor, clock, TTL, 10);
		id[0] = holder[0].create(REQUEST).id();
		String pending = holder[0].create(REQUEST).id();

		clock.advance(Duration.ofDays(1));
		holder[0].sweep();
		assertThat(holder[0].find(id[0])).isPresent();
		assertThat(holder[0].find(pending)).isPresent();

		executor.runNext();
		assertThat(runningSurvived[0]).isTrue();
		// TTL bitiş anından sayılır, oluşturulma anından değil.
		assertThat(holder[0].find(id[0])).isPresent();
	}

	@Test
	void capacityIsLimitedAndFreedWhenJobFinishes() {
		SceneJobService service = new SceneJobService(request -> RESULT, executor, Clock.systemUTC(), TTL, 2);
		service.create(REQUEST);
		service.create(REQUEST);
		assertThatThrownBy(() -> service.create(REQUEST))
				.isInstanceOfSatisfying(SceneCapacityException.class,
						e -> assertThat(e.retryAfterSeconds()).isPositive());

		executor.runNext();
		assertThat(service.create(REQUEST)).isNotNull();
	}

	@Test
	void slotIsReleasedWhenGeneratorFails() {
		SceneJobService service = new SceneJobService(request -> {
			throw new NoClassDefFoundError("x");
		}, executor, Clock.systemUTC(), TTL, 1);
		service.create(REQUEST);
		assertThatThrownBy(() -> service.create(REQUEST)).isInstanceOf(SceneCapacityException.class);

		executor.runNext();
		service.create(REQUEST);
		executor.runNext();
		assertThat(service.availableSlots()).isEqualTo(1);
		service.create(REQUEST);
		assertThat(service.availableSlots()).isZero();
	}

	@Test
	void retainedFinishedJobsAreCappedOldestFirst() {
		MutableClock clock = new MutableClock();
		SceneJobService service = new SceneJobService(request -> RESULT, executor, clock, TTL, 10, 3);
		String[] ids = new String[5];
		for (int i = 0; i < 5; i++) {
			ids[i] = service.create(REQUEST).id();
			executor.runNext();
			clock.advance(Duration.ofSeconds(1));
		}
		String latest = service.create(REQUEST).id();

		assertThat(service.find(ids[0])).isEmpty();
		assertThat(service.find(ids[1])).isEmpty();
		assertThat(service.find(ids[2])).isPresent();
		assertThat(service.find(ids[3])).isPresent();
		assertThat(service.find(ids[4])).isPresent();
		assertThat(service.find(latest)).isPresent();
	}

	@Test
	void retentionCapNeverRemovesActiveJobs() {
		SceneJobService service = new SceneJobService(request -> RESULT, executor, new MutableClock(), TTL, 10, 1);
		String[] ids = new String[4];
		for (int i = 0; i < 4; i++) {
			ids[i] = service.create(REQUEST).id();
		}
		for (String id : ids) {
			assertThat(service.find(id)).isPresent();
		}
	}

	@Test
	void ttlSweepIsThrottled() {
		MutableClock clock = new MutableClock();
		SceneJobService service = new SceneJobService(request -> RESULT, executor, clock, Duration.ofSeconds(10), 10,
				100);
		service.create(REQUEST);
		executor.runNext();
		clock.advance(Duration.ofSeconds(11));
		service.create(REQUEST);
		// Süpürme aralığı (30 sn) dolmadı: eski iş map'te kalır ama find yok sayar.
		assertThat(service.size()).isEqualTo(2);
		clock.advance(Duration.ofSeconds(SceneJobService.SWEEP_INTERVAL_SECONDS));
		service.create(REQUEST);
		assertThat(service.size()).isEqualTo(2);
	}

	@Test
	void slotIsReleasedOnlyOnceWithSynchronousExecutor() {
		MutableClock clock = new MutableClock();
		boolean[] breakClock = new boolean[1];
		Clock flaky = new Clock() {
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
				if (breakClock[0]) {
					throw new IllegalStateException("saat bozuk");
				}
				return clock.instant();
			}
		};
		// run() bitişte clock.instant() çağırır; senkron executor hatayı create'e taşır.
		Executor sync = command -> {
			breakClock[0] = true;
			try {
				command.run();
			}
			finally {
				breakClock[0] = false;
			}
		};
		SceneJobService service = new SceneJobService(request -> RESULT, sync, flaky, TTL, 2);
		assertThatThrownBy(() -> service.create(REQUEST)).isInstanceOf(IllegalStateException.class);
		assertThat(service.availableSlots()).isEqualTo(2);
		assertThat(service.size()).isZero();
	}

	@Test
	void interruptFlagIsRestoredWhenGeneratorThrowsInterruptedException() {
		SceneJobService service = new SceneJobService(request -> {
			SceneJobServiceTest.<RuntimeException>sneaky(new InterruptedException("kes"));
			return RESULT;
		}, Runnable::run);
		try {
			SceneJob created = service.create(REQUEST);
			assertThat(Thread.currentThread().isInterrupted()).isTrue();
			assertThat(service.find(created.id()).orElseThrow().status()).isEqualTo(SceneStatus.FAILED);
		}
		finally {
			Thread.interrupted();
		}
	}

	@SuppressWarnings("unchecked")
	private static <E extends Throwable> void sneaky(Throwable t) throws E {
		throw (E) t;
	}

	@Test
	void invalidConfigurationIsRejected() {
		for (Duration bad : new Duration[] {Duration.ZERO, Duration.ofSeconds(-1)}) {
			assertThatThrownBy(() -> new SceneJobService(request -> RESULT, executor, Clock.systemUTC(), bad, 1, 1))
					.isInstanceOf(IllegalArgumentException.class);
		}
		assertThatThrownBy(() -> new SceneJobService(request -> RESULT, executor, Clock.systemUTC(), TTL, 1, 0))
				.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new SceneJobService(request -> RESULT, executor, Clock.systemUTC(), TTL, 0))
				.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void slotIsReleasedWhenExecutorRejects() {
		Executor rejecting = command -> {
			throw new RejectedExecutionException("kapalı");
		};
		SceneJobService service = new SceneJobService(request -> RESULT, rejecting, Clock.systemUTC(), TTL, 1);
		assertThatThrownBy(() -> service.create(REQUEST)).isInstanceOf(RejectedExecutionException.class);
		assertThatThrownBy(() -> service.create(REQUEST)).isInstanceOf(RejectedExecutionException.class);
		assertThat(service.size()).isZero();
	}

	@Test
	void shutdownClosesOwnedExecutorOnly() {
		ExecutorService owned = Executors.newSingleThreadExecutor();
		new SceneJobService(request -> RESULT, owned, owned, Clock.systemUTC(), TTL, 1, 10).shutdown();
		assertThat(owned.isShutdown()).isTrue();

		ExecutorService borrowed = Executors.newSingleThreadExecutor();
		new SceneJobService(request -> RESULT, borrowed, null, Clock.systemUTC(), TTL, 1, 10).shutdown();
		assertThat(borrowed.isShutdown()).isFalse();
		borrowed.shutdown();
	}
}
