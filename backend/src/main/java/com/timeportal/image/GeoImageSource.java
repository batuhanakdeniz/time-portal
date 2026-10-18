package com.timeportal.image;

import java.util.Optional;

/** Bir noktanın çevresinde görsel arayan tek kaynak (Mapillary ya da Commons). */
public interface GeoImageSource {

	/** Kaynak yapılandırılmış mı (ör. anahtar var mı)? Değilse zincir adımı atlar. */
	default boolean available() {
		return true;
	}

	/**
	 * {@code radiusMeters} içindeki en uygun görseli döner.
	 *
	 * @throws ImageSourceException kaynak hata verirse
	 */
	Optional<CityImage> find(double latitude, double longitude, double radiusMeters);
}
