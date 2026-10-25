package com.timeportal.depth;

/**
 * Derinlik haritasını 0-255 griye çevirirken kullanılan ölçek ayarları (#66).
 *
 * <p>Göreli ters derinlikte kameranın hemen altındaki zemin çok büyük değerler alır; düz min-max
 * normalizasyonda ölçeğin çoğunu kaplar ve binalar birbirine yakın koyu tonda kalır. Bu yüzden ölçek
 * istatistiği (alt/üst sınır) panoramada alt şerit hariç tutularak ve yüzdelik kırpmayla hesaplanır;
 * ardından gamma eğrisi orta tonları açar. Hariç tutulan şerit yine çıktıya yazılır (sınırın üstü 255).
 *
 * @param panoramaExcludeBottom panoramada istatistikten hariç tutulan alt şerit (yükseklik oranı, [0, 1));
 *     fotoğrafta uygulanmaz
 * @param lowPercentile alt kırpma yüzdeliği (bu yüzdelik 0 olur)
 * @param highPercentile üst kırpma yüzdeliği (bu yüzdelik 255 olur)
 * @param gamma ton eğrisi üssü; 1 doğrusal, 1'den küçük orta tonları açar
 */
public record DepthNormalization(double panoramaExcludeBottom, double lowPercentile, double highPercentile,
		double gamma) {

	/** Varsayılan alt şerit: yükseklik %15 (gerçek panorama ölçümleri, #66). */
	public static final double DEFAULT_EXCLUDE_BOTTOM = 0.15;
	public static final double DEFAULT_LOW_PERCENTILE = 1;
	public static final double DEFAULT_HIGH_PERCENTILE = 99;
	/** Varsayılan gamma (gerçek panorama ve fotoğraf ölçümleriyle seçildi, #66). */
	public static final double DEFAULT_GAMMA = 0.7;

	/** Eski davranış: düz min-max, hariç tutma ve eğri yok. */
	public static final DepthNormalization MIN_MAX = new DepthNormalization(0, 0, 100, 1);

	public DepthNormalization {
		DepthMath.checkNormalization(panoramaExcludeBottom, lowPercentile, highPercentile, gamma);
	}

	public static DepthNormalization defaults() {
		return new DepthNormalization(DEFAULT_EXCLUDE_BOTTOM, DEFAULT_LOW_PERCENTILE, DEFAULT_HIGH_PERCENTILE,
				DEFAULT_GAMMA);
	}
}
