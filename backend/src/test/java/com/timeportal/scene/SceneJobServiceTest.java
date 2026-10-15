package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayDeque;
import java.util.Queue;
import java.util.concurrent.Executor;
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

	private static final SceneRequest REQUEST = new SceneRequest(-44, 41.9, 12.5);
	private static final SceneResult RESULT = new SceneResult("/api/samples/p.png", "/api/samples/d.png");

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
	void generatorFailureMarksJobFailed() {
		SceneJobService service = new SceneJobService(request -> {
			throw new IllegalStateException("servis kapalı");
		}, executor);

		SceneJob created = service.create(REQUEST);
		executor.runNext();

		SceneJob failed = service.find(created.id()).orElseThrow();
		assertThat(failed.status()).isEqualTo(SceneStatus.FAILED);
		assertThat(failed.result()).isNull();
		assertThat(failed.error()).contains("servis kapalı");
	}

	@Test
	void unknownJobIsEmpty() {
		SceneJobService service = new SceneJobService(request -> RESULT, executor);
		assertThat(service.find("yok")).isEmpty();
	}

	@Test
	void eachJobGetsOwnId() {
		SceneJobService service = new SceneJobService(request -> RESULT, executor);
		assertThat(service.create(REQUEST).id()).isNotEqualTo(service.create(REQUEST).id());
	}

	@Test
	void illegalTransitionsAreRejected() {
		SceneJob pending = new SceneJob("a", REQUEST, SceneStatus.PENDING, null, null, java.time.Instant.now());
		assertThatThrownBy(() -> pending.ready(RESULT)).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> pending.failed("x")).isInstanceOf(IllegalStateException.class);

		SceneJob ready = pending.running().ready(RESULT);
		assertThatThrownBy(ready::running).isInstanceOf(IllegalStateException.class);
	}
}
