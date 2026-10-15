package com.timeportal.scene;

/**
 * Üretilecek sahnenin tarihi ve konumu.
 *
 * <p>Negatif yıl MÖ'dür (MÖ 44 = -44). Takvimde yıl 0 yoktur, bu yüzden kabul edilmez.
 */
public record SceneRequest(int year, double latitude, double longitude) {

	public static final int MIN_YEAR = -100_000;
	public static final int MAX_YEAR = 100_000;

	public SceneRequest {
		if (year == 0 || year < MIN_YEAR || year > MAX_YEAR) {
			throw new IllegalArgumentException(
					"year must be between %d and %d and not 0 (negative = BC)".formatted(MIN_YEAR, MAX_YEAR));
		}
		if (!Double.isFinite(latitude) || latitude < -90 || latitude > 90) {
			throw new IllegalArgumentException("latitude must be between -90 and 90");
		}
		if (!Double.isFinite(longitude) || longitude < -180 || longitude > 180) {
			throw new IllegalArgumentException("longitude must be between -180 and 180");
		}
	}
}
