package com.timeportal.scene.cache;

import com.timeportal.scene.SceneGenerator;
import com.timeportal.scene.ScenePeriod;
import com.timeportal.scene.SceneRequest;
import com.timeportal.scene.SceneResult;
import com.timeportal.scene.StageListener;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Üreticinin önüne konan önbellek. Aynı {@link SceneCacheKey} için önceki başarılı sonucu döner.
 *
 * <p>Başarısız üretimler (istisna) saklanmaz ve istisna çağırana aynen yayılır. Boyut sınırlıdır
 * (LRU: en az yakın zamanda kullanılan düşer). Aynı anahtar için eşzamanlı istekler tek üretime
 * katılır (single-flight): ilk istek üretir, diğerleri sonucu (ya da aynı istisnayı) bekler.
 * Bekleyenler, öndeki işin fırlattığı istisna örneğinin aynısını alır (sarmalanmaz, paylaşılır).
 * Üretim pahalı ve gerçek servis kotalı olduğu için çift üretimi önlemeye değer.
 *
 * <p>Yıl dilimi dönem kovası sınırını aşabilir (ör. 1450–1459 dilimi 1453'te Selçuklu'dan Osmanlı'ya
 * geçer). Bu yüzden önbellekten ya da başka işin üretiminden dönen sonucun {@code period}'u dolu ise
 * istekteki yılın dönemiyle değiştirilir. Aşama dinleyicisi yalnızca üretimi yapan isteğin
 * delegesine iletilir; önbellekten dönen ya da bekleyen istekte aşama bildirilmez.
 */
public class CachingSceneGenerator implements SceneGenerator {

	private final SceneGenerator delegate;
	private final Map<SceneCacheKey, SceneResult> cache;
	private final Map<SceneCacheKey, CompletableFuture<SceneResult>> inFlight = new ConcurrentHashMap<>();

	public CachingSceneGenerator(SceneGenerator delegate, int maxEntries) {
		if (maxEntries < 1) {
			throw new IllegalArgumentException("maxEntries must be at least 1");
		}
		this.delegate = delegate;
		// access-order LinkedHashMap; tüm erişimler cache üzerinde senkronize.
		this.cache = new LinkedHashMap<>(16, 0.75f, true) {
			@Override
			protected boolean removeEldestEntry(Map.Entry<SceneCacheKey, SceneResult> eldest) {
				return size() > maxEntries;
			}
		};
	}

	@Override
	public SceneResult generate(SceneRequest request) {
		return generate(request, StageListener.NONE);
	}

	@Override
	public SceneResult generate(SceneRequest request, StageListener listener) {
		SceneCacheKey key = SceneCacheKey.of(request);
		SceneResult cached = lookup(key);
		if (cached != null) {
			return forPeriodOf(cached, request);
		}
		CompletableFuture<SceneResult> mine = new CompletableFuture<>();
		CompletableFuture<SceneResult> existing = inFlight.putIfAbsent(key, mine);
		if (existing != null) {
			return forPeriodOf(await(existing), request);
		}
		try {
			// Başka bir iş arada bitirip kaydetmiş olabilir.
			SceneResult result = lookup(key);
			if (result == null) {
				result = delegate.generate(request, listener);
				synchronized (cache) {
					cache.put(key, result);
				}
				mine.complete(result);
				return result;
			}
			mine.complete(result);
			return forPeriodOf(result, request);
		}
		catch (Throwable t) {
			// Delege işaretli istisnayı gizlice fırlatsa bile bekleyenler takılı kalmasın.
			mine.completeExceptionally(t);
			throw t;
		}
		finally {
			inFlight.remove(key, mine);
		}
	}

	/** Dönemi dolu sonucu istekteki yılın dönemine uyarlar; dönemsiz sonuca dokunmaz. */
	private static SceneResult forPeriodOf(SceneResult result, SceneRequest request) {
		if (result.period() == null) {
			return result;
		}
		ScenePeriod period = ScenePeriod.ofYear(request.year());
		return period.equals(result.period()) ? result : result.withPeriod(period);
	}

	private SceneResult lookup(SceneCacheKey key) {
		synchronized (cache) {
			return cache.get(key);
		}
	}

	private static SceneResult await(CompletableFuture<SceneResult> future) {
		try {
			return future.join();
		}
		catch (CompletionException e) {
			return CachingSceneGenerator.<RuntimeException, SceneResult>sneakyThrow(e.getCause());
		}
	}

	@SuppressWarnings("unchecked")
	private static <T extends Throwable, R> R sneakyThrow(Throwable t) throws T {
		throw (T) t;
	}
}
