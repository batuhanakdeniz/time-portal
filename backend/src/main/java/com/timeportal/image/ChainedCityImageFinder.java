package com.timeportal.image;

import com.timeportal.geo.District;
import com.timeportal.geo.ProvinceCenters;
import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Arama zinciri; her adımda ilk bulunan kullanılır:
 * <ol>
 * <li>Mapillary: ilçe merkezine {@value #NEAR_M} m içinde 360° panorama</li>
 * <li>Mapillary: {@value #FAR_M} m içinde 360° panorama</li>
 * <li>Commons: ilçe merkezine {@value #FAR_M} m içinde görsel</li>
 * <li>Commons: il merkezine {@value #FAR_M} m içinde görsel</li>
 * </ol>
 * Anahtar yoksa Mapillary adımları atlanır (uyarı bir kez loglanır). Bir kaynak hata verirse
 * (zaman aşımı, 5xx, bozuk yanıt) uyarı loglanır ve sıradaki adıma geçilir; Mapillary 300 m
 * adımı hata verdiyse 1 km adımı da denenmez (aynı servis). Hiçbiri bulamazsa boş döner
 * ({@link CityImageFinder#NO_IMAGE_MESSAGE}).
 *
 * <p>Tüm zincire toplam süre bütçesi uygulanır (varsayılan {@link #DEFAULT_TOTAL_TIMEOUT}). Her adımdan
 * önce ve Mapillary hücreleri arasında kontrol edilir; bütçe dolunca kalan adımlar atlanır. Bir adım
 * bütçeyi en çok tek bir HTTP isteği süresi kadar aşabilir. Hata ya da bütçe aşımı
 * {@link FindOutcome#degraded()} ile bildirilir.
 */
public class ChainedCityImageFinder implements CityImageFinder {

	static final double NEAR_M = 300;
	static final double FAR_M = 1000;
	public static final Duration DEFAULT_TOTAL_TIMEOUT = Duration.ofSeconds(25);
	/** İlçe merkezi il merkeziyle aynı sayılırsa 4. adım tekrar sorgulanmaz. */
	private static final double SAME_POINT_M = 50;

	private static final Logger log = LoggerFactory.getLogger(ChainedCityImageFinder.class);

	private final GeoImageSource mapillary;
	private final GeoImageSource commons;
	private final ProvinceCenters provinceCenters;
	private final Clock clock;
	private final Duration totalTimeout;
	private final AtomicBoolean warnedNoToken = new AtomicBoolean();

	public ChainedCityImageFinder(GeoImageSource mapillary, GeoImageSource commons, ProvinceCenters provinceCenters) {
		this(mapillary, commons, provinceCenters, Clock.systemUTC(), DEFAULT_TOTAL_TIMEOUT);
	}

	public ChainedCityImageFinder(GeoImageSource mapillary, GeoImageSource commons, ProvinceCenters provinceCenters,
			Clock clock, Duration totalTimeout) {
		if (totalTimeout.isNegative() || totalTimeout.isZero()) {
			throw new IllegalArgumentException("totalTimeout must be positive");
		}
		this.mapillary = mapillary;
		this.commons = commons;
		this.provinceCenters = provinceCenters;
		this.clock = clock;
		this.totalTimeout = totalTimeout;
	}

	@Override
	public Optional<CityImage> find(District d) {
		return findDetailed(d).image();
	}

	@Override
	public FindOutcome findDetailed(District d) {
		Run run = new Run(Deadline.after(clock, totalTimeout));
		Optional<CityImage> found = Optional.empty();
		if (mapillary.available()) {
			found = run.attempt("Mapillary " + (int) NEAR_M + " m", mapillary, d.centerLat(), d.centerLon(), NEAR_M);
			if (found.isEmpty() && !run.degraded) {
				found = run.attempt("Mapillary " + (int) FAR_M + " m", mapillary, d.centerLat(), d.centerLon(), FAR_M);
			}
		}
		else if (warnedNoToken.compareAndSet(false, true)) {
			log.warn("MAPILLARY_TOKEN is not set; skipping Mapillary steps and using Wikimedia Commons only");
		}
		if (found.isEmpty()) {
			found = run.attempt("Commons district", commons, d.centerLat(), d.centerLon(), FAR_M);
		}
		if (found.isEmpty()) {
			Optional<District> province = provinceCenters.centerOf(d.province());
			if (province.isPresent() && GeoMath.haversineMeters(d.centerLat(), d.centerLon(),
					province.get().centerLat(), province.get().centerLon()) > SAME_POINT_M) {
				found = run.attempt("Commons province center", commons, province.get().centerLat(),
						province.get().centerLon(), FAR_M);
			}
		}
		return new FindOutcome(found, run.degraded);
	}

	private static final class Run {
		final Deadline deadline;
		boolean degraded;

		Run(Deadline deadline) {
			this.deadline = deadline;
		}

		Optional<CityImage> attempt(String step, GeoImageSource source, double lat, double lon, double radius) {
			if (deadline.expired()) {
				if (!degraded) {
					log.warn("Image search time budget exhausted before step '{}'; skipping remaining steps", step);
				}
				degraded = true;
				return Optional.empty();
			}
			try {
				Optional<CityImage> r = source.find(lat, lon, radius, deadline);
				if (deadline.degraded()) {
					degraded = true;
				}
				return r;
			}
			catch (RuntimeException e) {
				degraded = true;
				log.warn("Image step '{}' failed, moving on: {}", step, e.getMessage());
				return Optional.empty();
			}
		}
	}
}
