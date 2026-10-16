package com.timeportal.scene.cache;

import static org.assertj.core.api.Assertions.assertThat;

import com.timeportal.scene.SceneRequest;
import org.junit.jupiter.api.Test;

class SceneCacheKeyTest {

	private static SceneCacheKey key(int year, double lat, double lon) {
		return SceneCacheKey.of(new SceneRequest(year, lat, lon));
	}

	@Test
	void nearbyPointsShareCell() {
		assertThat(key(2000, 41.9001, 12.5001)).isEqualTo(key(2000, 41.8999, 12.4999));
		assertThat(key(2000, 41.90, 12.50)).isNotEqualTo(key(2000, 41.92, 12.50));
	}

	@Test
	void roundingBoundaryIsHalfAwayFromZero() {
		assertThat(key(2000, 1.005, 0).latCell()).isEqualTo(101);
		assertThat(key(2000, 1.0049, 0).latCell()).isEqualTo(100);
		assertThat(key(2000, -1.005, 0).latCell()).isEqualTo(-101);
		assertThat(key(2000, 0, 0.004).lonCell()).isZero();
		assertThat(key(2000, 0, 0.005).lonCell()).isEqualTo(1);
	}

	@Test
	void antimeridianMapsToSameCell() {
		assertThat(key(2000, 10, 180)).isEqualTo(key(2000, 10, -180));
		assertThat(key(2000, 10, 180).lonCell()).isEqualTo(18000);
		assertThat(key(2000, 10, -179.999)).isEqualTo(key(2000, 10, 180));
		assertThat(key(2000, 10, 179)).isNotEqualTo(key(2000, 10, -179));
	}

	@Test
	void polesIgnoreLongitude() {
		assertThat(key(2000, 90, -180)).isEqualTo(key(2000, 90, 0)).isEqualTo(key(2000, 90, 123.4));
		assertThat(key(2000, -90, 55)).isEqualTo(key(2000, -90, -55));
		assertThat(key(2000, 90, 0)).isNotEqualTo(key(2000, -90, 0));
		assertThat(key(2000, 89.999, 10)).isEqualTo(key(2000, 90, 99));
		assertThat(key(2000, 89.98, 10)).isNotEqualTo(key(2000, 89.98, 20));
	}

	@Test
	void yearsWithinHundredOfNowAreExact() {
		assertThat(key(2026, 0, 0)).isNotEqualTo(key(2025, 0, 0));
		assertThat(key(1926, 0, 0)).isNotEqualTo(key(1927, 0, 0));
		assertThat(key(2126, 0, 0)).isNotEqualTo(key(2125, 0, 0));
		assertThat(key(1926, 0, 0).yearWidth()).isEqualTo(1);
	}

	@Test
	void decadeBucketsBeyondHundredYears() {
		// 1925 -> mesafe 101 -> 10 yıllık: 1920..1929
		assertThat(key(1925, 0, 0)).isEqualTo(key(1920, 0, 0));
		// 1926 mesafe 100: tam yıl, dilime girmez
		assertThat(key(1925, 0, 0)).isNotEqualTo(key(1926, 0, 0));
		assertThat(key(1925, 0, 0)).isNotEqualTo(key(1919, 0, 0));
		assertThat(key(1925, 0, 0).yearWidth()).isEqualTo(10);
		// 1026 -> mesafe 1000 hâlâ 10 yıllık
		assertThat(key(1026, 0, 0).yearWidth()).isEqualTo(10);
		assertThat(key(1026, 0, 0).yearStart()).isEqualTo(1020);
		assertThat(key(1026, 0, 0)).isNotEqualTo(key(1025, 0, 0)); // 1025 yüzyıllık dilimde
	}

	@Test
	void centuryBuckets() {
		assertThat(key(1025, 0, 0).yearWidth()).isEqualTo(100); // mesafe 1001
		assertThat(key(1025, 0, 0)).isEqualTo(key(1001, 0, 0));
		assertThat(key(1025, 0, 0)).isNotEqualTo(key(900, 0, 0));
		assertThat(key(-7974, 0, 0).yearWidth()).isEqualTo(100); // mesafe 10000
	}

	@Test
	void millenniumBuckets() {
		assertThat(key(-7975, 0, 0).yearWidth()).isEqualTo(1000); // mesafe 10001
		assertThat(key(-7975, 0, 0)).isEqualTo(key(-8000, 0, 0));
		assertThat(key(-7975, 0, 0)).isNotEqualTo(key(-8001, 0, 0));
		assertThat(key(100_000, 0, 0).yearWidth()).isEqualTo(1000);
	}

	@Test
	void negativeYearsBucketConsistentlyWithFloorDiv() {
		assertThat(key(-44, 0, 0).yearWidth()).isEqualTo(100); // mesafe 2070
		assertThat(key(-44, 0, 0).yearStart()).isEqualTo(-100);
		assertThat(key(-1, 0, 0)).isEqualTo(key(-44, 0, 0)).isEqualTo(key(-100, 0, 0));
		assertThat(key(-101, 0, 0).yearStart()).isEqualTo(-200);
		assertThat(key(-101, 0, 0)).isNotEqualTo(key(-100, 0, 0));
	}

	@Test
	void yearAroundMissingZeroDoesNotBreakKeys() {
		assertThat(key(1, 0, 0)).isNotEqualTo(key(-1, 0, 0));
		assertThat(key(1, 0, 0).yearStart()).isZero();
		assertThat(key(-100_000, 0, 0).yearStart()).isEqualTo(-100_000);
	}

	@Test
	void differentWidthsWithSameStartDoNotCollide() {
		// 2120 (mesafe 94, tam yıl) ile 2127 (mesafe 101, dilim başı 2120) çakışmamalı
		assertThat(key(2120, 0, 0)).isNotEqualTo(key(2127, 0, 0));
	}
}
