package com.timeportal.image;

import com.timeportal.geo.District;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * İlçe başına (il + ad) TTL'li önbellek; boş sonuç da kısa süre saklanır, böylece aynı ilçe için
 * dış servislere tekrar tekrar gidilmez.
 *
 * <p>TTL kararı: Mapillary {@code thumb_2048_url} adresinin imzalı/süreli olup olmadığı belgelerde
 * yazmaz (Facebook CDN adresleri genelde {@code oe=} ile süre sınırlıdır). Bu yüzden Mapillary
 * sonuçları kısa ({@link #mapillaryTtl}), Commons sonuçları (kalıcı adres) uzun saklanır. İmza süresi
 * ölçülünce {@code mapillaryTtl} ayarlanabilir; adres süresi dolmadan önce yeniden aranır.
 * Eşzamanlı aynı ilçe istekleri ayrı arama yapabilir (kasıtlı basitlik); dış istekler kilit altında
 * yapılmaz.
 */
public class CachingCityImageFinder implements CityImageFinder {

	private record Cached(Optional<CityImage> value, Instant expiresAt) {
	}

	private final CityImageFinder delegate;
	private final Clock clock;
	private final Duration mapillaryTtl;
	private final Duration commonsTtl;
	private final Duration emptyTtl;
	private final Duration transientTtl;
	private final Map<String, Cached> cache;

	public CachingCityImageFinder(CityImageFinder delegate, Clock clock, Duration mapillaryTtl, Duration commonsTtl,
			Duration emptyTtl, int maxEntries) {
		this(delegate, clock, mapillaryTtl, commonsTtl, emptyTtl, emptyTtl, maxEntries);
	}

	/**
	 * @param transientTtl zincir "geçici hata" bildirdiğinde (kaynak hatası, süre bütçesi aşımı) sonuç
	 * (Commons'tan bile olsa) en çok bu kadar saklanır
	 */
	public CachingCityImageFinder(CityImageFinder delegate, Clock clock, Duration mapillaryTtl, Duration commonsTtl,
			Duration emptyTtl, Duration transientTtl, int maxEntries) {
		if (maxEntries < 1) {
			throw new IllegalArgumentException("maxEntries must be at least 1");
		}
		this.delegate = delegate;
		this.clock = clock;
		this.mapillaryTtl = mapillaryTtl;
		this.commonsTtl = commonsTtl;
		this.emptyTtl = emptyTtl;
		this.transientTtl = transientTtl;
		this.cache = new LinkedHashMap<>(16, 0.75f, true) {
			@Override
			protected boolean removeEldestEntry(Map.Entry<String, Cached> eldest) {
				return size() > maxEntries;
			}
		};
	}

	@Override
	public Optional<CityImage> find(District district) {
		String key = district.province() + "/" + district.name();
		Instant now = clock.instant();
		synchronized (cache) {
			Cached e = cache.get(key);
			if (e != null && now.isBefore(e.expiresAt())) {
				return e.value();
			}
		}
		FindOutcome outcome = delegate.findDetailed(district);
		Optional<CityImage> result = outcome.image();
		Duration ttl = ttlFor(result);
		if (outcome.degraded() && transientTtl.compareTo(ttl) < 0) {
			ttl = transientTtl;
		}
		Instant expires = clock.instant().plus(ttl);
		synchronized (cache) {
			cache.put(key, new Cached(result, expires));
		}
		return result;
	}

	private Duration ttlFor(Optional<CityImage> result) {
		if (result.isEmpty()) {
			return emptyTtl;
		}
		String source = result.get().attribution().sourceUrl();
		return source != null && source.startsWith("https://www.mapillary.com/") ? mapillaryTtl : commonsTtl;
	}
}
