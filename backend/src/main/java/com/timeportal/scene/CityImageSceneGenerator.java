package com.timeportal.scene;

import com.timeportal.artifact.ArtifactStore;
import com.timeportal.artifact.FetchedImage;
import com.timeportal.artifact.ImageFetcher;
import com.timeportal.depth.DepthPipeline;
import com.timeportal.geo.District;
import com.timeportal.geo.DistrictLocator;
import com.timeportal.image.CityImage;
import com.timeportal.image.CityImageFinder;
import com.timeportal.image.FindOutcome;
import com.timeportal.image.ImageKind;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * İlk gerçek üretici (#41): konum → ilçe ({@link DistrictLocator}) → ilçe merkezi görseli
 * ({@link CityImageFinder}) → indir ve sakla → derinlik ({@link DepthPipeline}) → sonuç.
 *
 * <p>Görsel yalnızca ilçeye bağlıdır (yıl şimdilik yalnızca {@code period} için kullanılır). İlçe başına yapıtlar önbelleğe alınır
 * ve aynı ilçeye eşzamanlı gelen istekler tek aramaya/çıkarıma bağlanır (ilçe başına
 * {@link CompletableFuture}, single-flight). Hata önbelleğe alınmaz: başarısız hesap girdisi silinir,
 * sonraki istek yeniden dener; o anda bekleyenler aynı istisnayı alır. Arama "geçici hata" bildirdiyse
 * ({@link FindOutcome#degraded()}) sonuç kısa süre ({@code degradedTtl}) tutulur. Diskten silinmiş
 * yapıtlı girdi geçersiz sayılır ve yeniden hesaplanır.
 *
 * <p><b>Dönem:</b> önbellek ilçe başınadır ve yıldan bağımsızdır; {@code period} her çağrıda istekteki
 * yıldan sonuca eklenir (önbellekteki sonuç dönemsizdir).
 *
 * <p><b>Aşamalar:</b> {@link SceneStage} sırasıyla bildirilir: konum bulunurken {@code LOCATING},
 * görsel arama ve indirme {@code IMAGE_SEARCH}, derinlik çıkarımı {@code DEPTH}, derinliğin saklanması
 * ve sonucun kurulması {@code PACKAGING}. Önbellekten dönen sonuçta yalnızca {@code LOCATING}
 * bildirilir. Aynı ilçenin süren hesabını bekleyen istek (single-flight) önce sahibin o anki aşamasını,
 * sonra sahibin sonraki aşamalarını alır; yani bekleyenin aşaması kendi işini değil sahibin işini
 * yansıtır. Bekleyen zaman aşımına uğrarsa dinleyicisi bırakılır.
 */
public class CityImageSceneGenerator implements SceneGenerator {

	static final String ARTIFACT_PREFIX = "/api/artifacts/";
	private static final float JPEG_QUALITY = 0.9f;

	private static final Logger log = LoggerFactory.getLogger(CityImageSceneGenerator.class);

	private record Computed(SceneResult result, boolean degraded) {
	}

	private static final class Entry {
		final CompletableFuture<Computed> future = new CompletableFuture<>();
		volatile Instant expiresAt = Instant.MAX;
		/** Sahibin son aşaması ve bekleyenlerin dinleyicileri; ikisi de {@code this} ile korunur. */
		private SceneStage stage = SceneStage.LOCATING;
		private final List<StageListener> waiters = new ArrayList<>();

		/** Sahip yeni aşamaya geçti: kendi dinleyicisine ve bekleyenlere bildir. */
		synchronized void advance(SceneStage next, StageListener owner) {
			stage = next;
			notifySafely(owner, next);
			for (StageListener waiter : waiters) {
				notifySafely(waiter, next);
			}
		}

		/** Bekleyeni ekler ve sahibin o anki aşamasını ona bildirir. */
		synchronized void join(StageListener waiter) {
			waiters.add(waiter);
			notifySafely(waiter, stage);
		}

		synchronized void leave(StageListener waiter) {
			waiters.remove(waiter);
		}
	}

	private final DistrictLocator locator;
	private final CityImageFinder finder;
	private final ImageFetcher fetcher;
	private final DepthPipeline pipeline;
	private final ArtifactStore store;
	private final Clock clock;
	private final Duration ttl;
	private final Duration degradedTtl;
	private final int maxEntries;
	private final Duration waitTimeout;
	private final ConcurrentMap<String, Entry> entries = new ConcurrentHashMap<>();

	public CityImageSceneGenerator(DistrictLocator locator, CityImageFinder finder, ImageFetcher fetcher,
			DepthPipeline pipeline, ArtifactStore store, Clock clock, Duration ttl, Duration degradedTtl,
			int maxEntries) {
		this(locator, finder, fetcher, pipeline, store, clock, ttl, degradedTtl, maxEntries, Duration.ofSeconds(120));
	}

	/** {@code waitTimeout}: sürmekte olan hesabı bekleyen isteklerin üst süresi; aşılırsa iş FAILED olur. */
	public CityImageSceneGenerator(DistrictLocator locator, CityImageFinder finder, ImageFetcher fetcher,
			DepthPipeline pipeline, ArtifactStore store, Clock clock, Duration ttl, Duration degradedTtl,
			int maxEntries, Duration waitTimeout) {
		this.waitTimeout = waitTimeout;
		this.locator = locator;
		this.finder = finder;
		this.fetcher = fetcher;
		this.pipeline = pipeline;
		this.store = store;
		this.clock = clock;
		this.ttl = ttl;
		this.degradedTtl = degradedTtl;
		this.maxEntries = Math.max(1, maxEntries);
	}

	@Override
	public SceneResult generate(SceneRequest request) {
		return generate(request, StageListener.NONE);
	}

	@Override
	public SceneResult generate(SceneRequest request, StageListener listener) {
		ScenePeriod period = ScenePeriod.ofYear(request.year());
		notifySafely(listener, SceneStage.LOCATING);
		District district = locator.locate(request.latitude(), request.longitude())
			.orElseThrow(() -> new IllegalStateException("location outside supported area"));
		String key = district.province() + "|" + district.name();
		boolean[] owner = {false};
		Entry entry = entries.compute(key, (k, old) -> {
			if (old != null && usable(old)) {
				return old;
			}
			owner[0] = true;
			return new Entry();
		});
		if (!owner[0]) {
			if (entry.future.isDone()) {
				return await(entry.future, waitTimeout).result().withPeriod(period);
			}
			entry.join(listener);
			try {
				return await(entry.future, waitTimeout).result().withPeriod(period);
			}
			finally {
				entry.leave(listener);
			}
		}
		try {
			Computed computed = compute(district, stage -> entry.advance(stage, listener));
			entry.expiresAt = clock.instant().plus(computed.degraded() ? degradedTtl : ttl);
			entry.future.complete(computed);
			trim();
			return computed.result().withPeriod(period);
		}
		catch (Throwable t) {
			entries.remove(key, entry);
			entry.future.completeExceptionally(t);
			throw t;
		}
	}

	/** Süren hesap, ya da süresi dolmamış ve yapıtları hâlâ diskte olan başarılı sonuç. */
	private boolean usable(Entry e) {
		if (!e.future.isDone()) {
			return true;
		}
		if (e.future.isCompletedExceptionally() || !e.expiresAt.isAfter(clock.instant())) {
			return false;
		}
		SceneResult r = e.future.join().result();
		return store.exists(nameOf(r.panoramaUrl())) && store.exists(nameOf(r.depthUrl()));
	}

	private static String nameOf(String url) {
		return url.substring(ARTIFACT_PREFIX.length());
	}

	private Computed compute(District district, StageListener stages) {
		long t0 = System.nanoTime();
		stages.onStage(SceneStage.IMAGE_SEARCH);
		FindOutcome outcome = finder.findDetailed(district);
		CityImage found = outcome.image().orElseThrow(NoImageFoundException::new);
		long t1 = System.nanoTime();
		FetchedImage fetched;
		try {
			fetched = fetcher.fetch(found.url());
		}
		catch (IOException e) {
			throw new UncheckedIOException("image download failed", e);
		}
		long t2 = System.nanoTime();
		boolean panorama = found.kind() == ImageKind.PANORAMA_360;
		BufferedImage image = DepthPipeline.limit(fetched.image(), panorama);
		byte[] bytes = fetched.bytes();
		String ext = fetched.ext();
		if (image != fetched.image()) {
			bytes = encodeJpeg(image);
			ext = "jpg";
		}
		String imageName = store.saveImage(bytes, ext);
		stages.onStage(SceneStage.DEPTH);
		byte[] depthPng = pipeline.depthPng(image, panorama);
		stages.onStage(SceneStage.PACKAGING);
		String depthName = store.saveDepth(imageName, pipeline.normalization().cacheKey(panorama), depthPng);
		long t3 = System.nanoTime();
		log.info("Scene for {}/{}: kind={} {}x{} search={}ms download={}ms depth={}ms", district.province(),
				district.name(), panorama ? "panorama" : "photo", image.getWidth(), image.getHeight(),
				(t1 - t0) / 1_000_000, (t2 - t1) / 1_000_000, (t3 - t2) / 1_000_000);
		SceneResult result = new SceneResult(ARTIFACT_PREFIX + imageName, ARTIFACT_PREFIX + depthName,
				panorama ? SceneResult.KIND_PANORAMA : SceneResult.KIND_PHOTO,
				new SceneResult.Place(district.province(), district.name()), toAttribution(found));
		return new Computed(result, outcome.degraded());
	}

	/** Dinleyici hatası üretimi bozmasın. */
	private static void notifySafely(StageListener listener, SceneStage stage) {
		try {
			listener.onStage(stage);
		}
		catch (RuntimeException e) {
			log.warn("Stage listener failed at {}", stage, e);
		}
	}

	static SceneResult.Attribution toAttribution(CityImage image) {
		var a = image.attribution();
		String provider = a.provider() != null ? a.provider() : "unknown";
		return new SceneResult.Attribution(a.author(), a.license(), a.licenseUrl(), a.sourceUrl(), provider);
	}

	private static byte[] encodeJpeg(BufferedImage image) {
		BufferedImage rgb = image;
		if (image.getType() != BufferedImage.TYPE_INT_RGB) {
			rgb = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
			var g = rgb.createGraphics();
			g.drawImage(image, 0, 0, null);
			g.dispose();
		}
		ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
		try (ByteArrayOutputStream out = new ByteArrayOutputStream();
				MemoryCacheImageOutputStream ios = new MemoryCacheImageOutputStream(out)) {
			ImageWriteParam param = writer.getDefaultWriteParam();
			param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
			param.setCompressionQuality(JPEG_QUALITY);
			writer.setOutput(ios);
			writer.write(null, new IIOImage(rgb, null, null), param);
			ios.flush();
			return out.toByteArray();
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		finally {
			writer.dispose();
		}
	}

	/** Girdi sayısı sınırı aşarsa biten girdilerden bitiş zamanı en yakın olanları siler. */
	private void trim() {
		if (entries.size() <= maxEntries) {
			return;
		}
		var done = entries.entrySet().stream()
			.filter(e -> e.getValue().future.isDone())
			.sorted(Comparator.comparing(e -> e.getValue().expiresAt))
			.toList();
		for (int i = 0; i < done.size() && entries.size() > maxEntries; i++) {
			entries.remove(done.get(i).getKey(), done.get(i).getValue());
		}
	}

	private static Computed await(CompletableFuture<Computed> future, Duration timeout) {
		try {
			return future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
		}
		catch (ExecutionException e) {
			Throwable cause = e.getCause();
			if (cause instanceof RuntimeException r) {
				throw r;
			}
			if (cause instanceof Error err) {
				throw err;
			}
			throw new IllegalStateException(cause);
		}
		catch (TimeoutException e) {
			throw new IllegalStateException("timed out waiting for the scene of the same district");
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("interrupted while waiting for the scene", e);
		}
	}
}
