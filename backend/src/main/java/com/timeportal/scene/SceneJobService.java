package com.timeportal.scene;

import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Üretim işlerini oluşturur ve arka planda çalıştırır. İşler bellekte tutulur; bitmiş (READY/FAILED)
 * işler TTL sonra silinir, aynı anda bekleyen+çalışan iş sayısı sınırlıdır.
 *
 * <p>Temizlik tembeldir: her {@link #create} süpürür, {@link #find} süresi dolmuş işi yok sayar.
 * Map yalnızca {@code create} ile büyüdüğü için zamanlanmış görev gerekmez.
 */
@Service
public class SceneJobService {

	static final String GENERIC_FAILURE = "generation failed";
	static final int RETRY_AFTER_SECONDS = 5;

	private static final Logger log = LoggerFactory.getLogger(SceneJobService.class);

	private final ConcurrentMap<String, SceneJob> jobs = new ConcurrentHashMap<>();
	private final SceneGenerator generator;
	private final Executor executor;
	private final ExecutorService ownedExecutor;
	private final Clock clock;
	private final Duration ttl;
	private final Semaphore slots;

	@Autowired
	public SceneJobService(
			SceneGenerator generator,
			ObjectProvider<Clock> clock,
			@Value("${timeportal.jobs.ttl:PT1H}") Duration ttl,
			@Value("${timeportal.jobs.max-active:4}") int maxActive) {
		this(generator, clock.getIfAvailable(Clock::systemUTC), ttl, maxActive,
				Executors.newVirtualThreadPerTaskExecutor());
	}

	private SceneJobService(SceneGenerator generator, Clock clock, Duration ttl, int maxActive,
			ExecutorService owned) {
		this(generator, owned, owned, clock, ttl, maxActive);
	}

	/** Testler için: verilen executor'ı kapatmaz. */
	SceneJobService(SceneGenerator generator, Executor executor) {
		this(generator, executor, null, Clock.systemUTC(), Duration.ofHours(1), 4);
	}

	SceneJobService(SceneGenerator generator, Executor executor, Clock clock, Duration ttl, int maxActive) {
		this(generator, executor, null, clock, ttl, maxActive);
	}

	/** {@code owned} doluysa executor bu servise aittir ve {@link #shutdown} onu kapatır. */
	SceneJobService(SceneGenerator generator, Executor executor, ExecutorService owned, Clock clock, Duration ttl,
			int maxActive) {
		if (maxActive < 1) {
			throw new IllegalArgumentException("timeportal.jobs.max-active must be at least 1");
		}
		this.generator = generator;
		this.executor = executor;
		this.ownedExecutor = owned;
		this.clock = clock;
		this.ttl = ttl;
		this.slots = new Semaphore(maxActive);
	}

	public SceneJob create(SceneRequest request) {
		sweep();
		if (!slots.tryAcquire()) {
			throw new SceneCapacityException(RETRY_AFTER_SECONDS);
		}
		SceneJob job = SceneJob.pending(UUID.randomUUID().toString(), request, clock.instant());
		jobs.put(job.id(), job);
		try {
			executor.execute(() -> run(job.id()));
		}
		catch (RuntimeException | Error e) {
			// Görev hiç başlamadı; run() slotu serbest bırakmayacak.
			jobs.remove(job.id());
			slots.release();
			throw e;
		}
		return job;
	}

	public Optional<SceneJob> find(String id) {
		return Optional.ofNullable(jobs.get(id)).filter(job -> !expired(job, clock.instant()));
	}

	/** Süresi dolmuş bitmiş işleri siler. PENDING/RUNNING işlere dokunmaz. */
	void sweep() {
		Instant now = clock.instant();
		jobs.values().removeIf(job -> expired(job, now));
	}

	int size() {
		return jobs.size();
	}

	private boolean expired(SceneJob job, Instant now) {
		return job.isFinished() && !job.finishedAt().plus(ttl).isAfter(now);
	}

	private void run(String id) {
		try {
			SceneJob running = jobs.computeIfPresent(id, (key, job) -> job.running());
			if (running == null) {
				return;
			}
			SceneResult result = null;
			boolean failed = false;
			try {
				result = generator.generate(running.request());
			}
			catch (Throwable e) {
				// Error türevleri de dahil: iş asla RUNNING'de takılı kalmamalı.
				failed = true;
				log.error("Scene generation failed for job {}", id, e);
			}
			SceneResult finalResult = result;
			boolean finalFailed = failed;
			jobs.computeIfPresent(id, (key, job) -> finalFailed
					? job.failed(GENERIC_FAILURE, clock.instant())
					: job.ready(finalResult, clock.instant()));
		}
		finally {
			slots.release();
		}
	}

	@PreDestroy
	void shutdown() {
		if (ownedExecutor == null) {
			return;
		}
		ownedExecutor.shutdown();
		try {
			if (!ownedExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
				ownedExecutor.shutdownNow();
			}
		}
		catch (InterruptedException e) {
			ownedExecutor.shutdownNow();
			Thread.currentThread().interrupt();
		}
	}
}
