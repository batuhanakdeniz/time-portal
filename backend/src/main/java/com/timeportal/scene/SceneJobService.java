package com.timeportal.scene;

import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Comparator;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
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
 * <p>Temizlik tembeldir, zamanlanmış görev yoktur. {@link #find} süresi dolmuş işi yok sayar.
 * {@link #create} TTL süpürmesini en çok {@value #SWEEP_INTERVAL_SECONDS} sn'de bir yapar (her
 * istekte tam tarama yok). Ayrıca bitmiş iş sayısı {@code max-retained}'ı aşarsa en eski bitmişler
 * (finishedAt'e göre) silinir; bellek yalnızca zamanla değil sayıyla da sınırlıdır. Boyut kontrolü
 * ucuzdur, tam tarama yalnızca sınır aşılınca yapılır ve sınırın %10 altına kadar budar (amortize).
 * PENDING/RUNNING işler asla silinmez.
 */
@Service
public class SceneJobService {

	static final String GENERIC_FAILURE = "generation failed";
	static final int RETRY_AFTER_SECONDS = 5;
	static final int SWEEP_INTERVAL_SECONDS = 30;

	private static final Logger log = LoggerFactory.getLogger(SceneJobService.class);

	private final ConcurrentMap<String, SceneJob> jobs = new ConcurrentHashMap<>();
	private final SceneGenerator generator;
	private final Executor executor;
	private final ExecutorService ownedExecutor;
	private final Clock clock;
	private final Duration ttl;
	private final Semaphore slots;
	private final int maxRetained;
	private volatile Instant lastSweep;

	@Autowired
	public SceneJobService(
			SceneGenerator generator,
			ObjectProvider<Clock> clock,
			@Value("${timeportal.jobs.ttl:PT1H}") Duration ttl,
			@Value("${timeportal.jobs.max-active:4}") int maxActive,
			@Value("${timeportal.jobs.max-retained:1000}") int maxRetained) {
		this(generator, clock.getIfAvailable(Clock::systemUTC), ttl, maxActive, maxRetained,
				Executors.newVirtualThreadPerTaskExecutor());
	}

	private SceneJobService(SceneGenerator generator, Clock clock, Duration ttl, int maxActive, int maxRetained,
			ExecutorService owned) {
		this(generator, owned, owned, clock, ttl, maxActive, maxRetained);
	}

	/** Testler için: verilen executor'ı kapatmaz. */
	SceneJobService(SceneGenerator generator, Executor executor) {
		this(generator, executor, null, Clock.systemUTC(), Duration.ofHours(1), 4, 1000);
	}

	SceneJobService(SceneGenerator generator, Executor executor, Clock clock, Duration ttl, int maxActive) {
		this(generator, executor, null, clock, ttl, maxActive, 1000);
	}

	SceneJobService(SceneGenerator generator, Executor executor, Clock clock, Duration ttl, int maxActive,
			int maxRetained) {
		this(generator, executor, null, clock, ttl, maxActive, maxRetained);
	}

	/** {@code owned} doluysa executor bu servise aittir ve {@link #shutdown} onu kapatır. */
	SceneJobService(SceneGenerator generator, Executor executor, ExecutorService owned, Clock clock, Duration ttl,
			int maxActive, int maxRetained) {
		if (maxActive < 1) {
			throw new IllegalArgumentException("timeportal.jobs.max-active must be at least 1");
		}
		if (maxRetained < 1) {
			throw new IllegalArgumentException("timeportal.jobs.max-retained must be at least 1");
		}
		if (ttl == null || ttl.isZero() || ttl.isNegative()) {
			throw new IllegalArgumentException("timeportal.jobs.ttl must be positive");
		}
		this.maxRetained = maxRetained;
		this.lastSweep = clock.instant();
		this.generator = generator;
		this.executor = executor;
		this.ownedExecutor = owned;
		this.clock = clock;
		this.ttl = ttl;
		this.slots = new Semaphore(maxActive);
	}

	public SceneJob create(SceneRequest request) {
		maybeSweep();
		if (!slots.tryAcquire()) {
			throw new SceneCapacityException(RETRY_AFTER_SECONDS);
		}
		SceneJob job = SceneJob.pending(UUID.randomUUID().toString(), request, clock.instant());
		jobs.put(job.id(), job);
		// Slot iş başına yalnızca bir kez bırakılır: senkron executor'da run'ın finally'si ve
		// aşağıdaki catch birlikte çalışabilir.
		AtomicBoolean released = new AtomicBoolean();
		try {
			executor.execute(() -> run(job.id(), released));
		}
		catch (RuntimeException | Error e) {
			jobs.remove(job.id());
			release(released);
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

	private void maybeSweep() {
		Instant now = clock.instant();
		if (!lastSweep.plusSeconds(SWEEP_INTERVAL_SECONDS).isAfter(now)) {
			lastSweep = now;
			sweep();
		}
		if (jobs.size() > maxRetained) {
			trimFinished();
		}
	}

	/** Bitmiş iş sayısını sınırın %10 altına indirir, en eski bitenleri siler. */
	private void trimFinished() {
		int keep = maxRetained - maxRetained / 10;
		var finished = jobs.values().stream().filter(SceneJob::isFinished)
				.sorted(Comparator.comparing(SceneJob::finishedAt)).toList();
		for (int i = 0; i < finished.size() - keep; i++) {
			jobs.remove(finished.get(i).id(), finished.get(i));
		}
	}

	private void release(AtomicBoolean released) {
		if (released.compareAndSet(false, true)) {
			slots.release();
		}
	}

	int availableSlots() {
		return slots.availablePermits();
	}

	int size() {
		return jobs.size();
	}

	private boolean expired(SceneJob job, Instant now) {
		return job.isFinished() && !job.finishedAt().plus(ttl).isAfter(now);
	}

	private void run(String id, AtomicBoolean released) {
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
				if (e instanceof InterruptedException) {
					Thread.currentThread().interrupt();
				}
				log.error("Scene generation failed for job {}", id, e);
			}
			SceneResult finalResult = result;
			boolean finalFailed = failed;
			jobs.computeIfPresent(id, (key, job) -> finalFailed
					? job.failed(GENERIC_FAILURE, clock.instant())
					: job.ready(finalResult, clock.instant()));
		}
		finally {
			release(released);
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
