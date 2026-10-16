package com.timeportal.scene.cache;

import com.timeportal.scene.SceneRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Önbellek anahtarı: yaklaşık konum hücresi + tarih dilimi.
 *
 * <p><b>Konum:</b> enlem ve boylam 0,01° (~1 km) hücreye yuvarlanır; hücre indeksi derece x 100'dür
 * (yarım değerler sıfırdan uzağa yuvarlanır, ondalık gösterim üzerinden hesaplanır, böylece 1,005
 * gibi değerler ikili kayan nokta hatasından etkilenmez). Boylam -180 ile 180 aynı meridyendir,
 * ikisi de 180 hücresine düşer. Kutupta (yuvarlanmış enlem ±90) boylamın anlamı yoktur, boylam
 * hücresi 0 olur.
 *
 * <p><b>Yıl:</b> günümüze (2026) uzaklığa göre dilim genişliği büyür: |yıl-2026| &lt;= 100 tam yıl,
 * &lt;= 1000 on yıllık, &lt;= 10000 yüzyıllık, daha uzağı bin yıllık. Dilim başlangıcı
 * {@code floorDiv} ile bulunur, bu yüzden negatif (MÖ) yıllarda da dilimler kesintisiz ve
 * tutarlıdır. Hesap yıl sayısı üzerinden yapılır; takvimde olmayan yıl 0 (istek tarafından zaten
 * reddedilir) anahtar hesabını etkilemez. Dilim genişliği anahtarın parçasıdır, böylece farklı
 * genişlikteki dilimler aynı başlangıçta çakışmaz.
 */
public record SceneCacheKey(int latCell, int lonCell, int yearStart, int yearWidth) {

	static final int REFERENCE_YEAR = 2026;
	private static final int LAT_POLE_CELL = 9000;
	private static final int LON_HALF_TURN_CELL = 18000;

	public static SceneCacheKey of(SceneRequest request) {
		int latCell = toCell(request.latitude());
		int lonCell = toCell(request.longitude());
		if (Math.abs(latCell) == LAT_POLE_CELL) {
			lonCell = 0;
		}
		else if (lonCell == -LON_HALF_TURN_CELL) {
			lonCell = LON_HALF_TURN_CELL;
		}
		int width = yearWidth(request.year());
		int start = Math.floorDiv(request.year(), width) * width;
		return new SceneCacheKey(latCell, lonCell, start, width);
	}

	static int yearWidth(int year) {
		long distance = Math.abs((long) year - REFERENCE_YEAR);
		if (distance <= 100) {
			return 1;
		}
		if (distance <= 1_000) {
			return 10;
		}
		if (distance <= 10_000) {
			return 100;
		}
		return 1_000;
	}

	private static int toCell(double degrees) {
		return BigDecimal.valueOf(degrees).movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValueExact();
	}
}
