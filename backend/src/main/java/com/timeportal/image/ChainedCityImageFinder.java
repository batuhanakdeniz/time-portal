package com.timeportal.image;

import com.timeportal.geo.District;
import com.timeportal.geo.ProvinceCenters;
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
 */
public class ChainedCityImageFinder implements CityImageFinder {

	static final double NEAR_M = 300;
	static final double FAR_M = 1000;
	/** İlçe merkezi il merkeziyle aynı sayılırsa 4. adım tekrar sorgulanmaz. */
	private static final double SAME_POINT_M = 50;

	private static final Logger log = LoggerFactory.getLogger(ChainedCityImageFinder.class);

	private final GeoImageSource mapillary;
	private final GeoImageSource commons;
	private final ProvinceCenters provinceCenters;
	private final AtomicBoolean warnedNoToken = new AtomicBoolean();

	public ChainedCityImageFinder(GeoImageSource mapillary, GeoImageSource commons, ProvinceCenters provinceCenters) {
		this.mapillary = mapillary;
		this.commons = commons;
		this.provinceCenters = provinceCenters;
	}

	@Override
	public Optional<CityImage> find(District d) {
		Optional<CityImage> found = Optional.empty();
		boolean[] failed = new boolean[1];
		if (mapillary.available()) {
			found = attempt("Mapillary " + (int) NEAR_M + " m", mapillary, d.centerLat(), d.centerLon(), NEAR_M, failed);
			if (found.isEmpty() && !failed[0]) {
				found = attempt("Mapillary " + (int) FAR_M + " m", mapillary, d.centerLat(), d.centerLon(), FAR_M, failed);
			}
		}
		else if (warnedNoToken.compareAndSet(false, true)) {
			log.warn("MAPILLARY_TOKEN is not set; skipping Mapillary steps and using Wikimedia Commons only");
		}
		if (found.isPresent()) {
			return found;
		}
		found = attempt("Commons district", commons, d.centerLat(), d.centerLon(), FAR_M, failed);
		if (found.isPresent()) {
			return found;
		}
		Optional<District> province = provinceCenters.centerOf(d.province());
		if (province.isPresent() && GeoMath.haversineMeters(d.centerLat(), d.centerLon(), province.get().centerLat(),
				province.get().centerLon()) > SAME_POINT_M) {
			return attempt("Commons province center", commons, province.get().centerLat(), province.get().centerLon(), FAR_M, failed);
		}
		return Optional.empty();
	}

	private Optional<CityImage> attempt(String step, GeoImageSource source, double lat, double lon, double radius,
			boolean[] failed) {
		try {
			return source.find(lat, lon, radius);
		}
		catch (RuntimeException e) {
			failed[0] = true;
			log.warn("Image step '{}' failed, moving on: {}", step, e.getMessage());
			return Optional.empty();
		}
	}
}
