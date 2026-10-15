package com.timeportal.scene;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** Üretim işlerini oluşturur ve arka planda çalıştırır. Şimdilik işler bellekte tutulur. */
@Service
public class SceneJobService {

	private final ConcurrentMap<String, SceneJob> jobs = new ConcurrentHashMap<>();
	private final SceneGenerator generator;
	private final Executor executor;

	@Autowired
	public SceneJobService(SceneGenerator generator) {
		this(generator, Executors.newVirtualThreadPerTaskExecutor());
	}

	SceneJobService(SceneGenerator generator, Executor executor) {
		this.generator = generator;
		this.executor = executor;
	}

	public SceneJob create(SceneRequest request) {
		SceneJob job = new SceneJob(UUID.randomUUID().toString(), request, SceneStatus.PENDING, null, null,
				Instant.now());
		jobs.put(job.id(), job);
		executor.execute(() -> run(job.id()));
		return job;
	}

	public Optional<SceneJob> find(String id) {
		return Optional.ofNullable(jobs.get(id));
	}

	private void run(String id) {
		SceneJob running = jobs.computeIfPresent(id, (key, job) -> job.running());
		if (running == null) {
			return;
		}
		try {
			SceneResult result = generator.generate(running.request());
			jobs.computeIfPresent(id, (key, job) -> job.ready(result));
		}
		catch (RuntimeException e) {
			String message = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
			jobs.computeIfPresent(id, (key, job) -> job.failed(message));
		}
	}
}
