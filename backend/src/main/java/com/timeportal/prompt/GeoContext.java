package com.timeportal.prompt;

import java.util.Optional;

/**
 * Bir koordinatın coğrafi bağlamını (ör. kıta/bölge adı) verir.
 *
 * <p>Güvenilir bölge bilgisi veri gerektirir (bkz. issue #34, Natural Earth). O veri gelene kadar
 * {@link #UNKNOWN} kullanılır ve tarife hiçbir bölge adı yazılmaz. Kaba sınırlayıcı kutularla tahmin
 * yapılmaz; yanlış bölge yazmak uydurma bilgidir.
 */
public interface GeoContext {

	/** Her zaman bilinmiyor döner. */
	GeoContext UNKNOWN = (latitude, longitude) -> Optional.empty();

	/** Bölge adı biliniyorsa döner; emin değilse boş. */
	Optional<String> regionName(double latitude, double longitude);
}
