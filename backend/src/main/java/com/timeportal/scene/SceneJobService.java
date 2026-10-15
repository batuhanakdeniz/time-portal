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
		SceneJob job = SceneJob.pending(UUID.randomUUID().toString(), request, Instant.now());
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
		SceneResult result = null;
		String failure = null;
		try {
			result = generator.generate(running.request());
		}
		catch (Throwable e) {
			// Error türevleri de dahil: iş asla RUNNING'de takılı kalmamalı.
			failure = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
		}
		SceneResult finalResult = result;
		String finalFailure = failure;
		jobs.computeIfPresent(id, (key, job) -> finalFailure == null ? job.ready(finalResult) : job.failed(finalFailure));
	}
}
