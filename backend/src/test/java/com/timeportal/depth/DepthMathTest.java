package com.timeportal.depth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class DepthMathTest {

	private static DepthMap map(int w, int h, float... v) {
		return new DepthMap(w, h, v);
	}

	@Test
	void modelInputSizeScalesShortSideTo518AndRoundsToMultipleOf14() {
		// 4:3: kısa kenar 518 (= 37*14), uzun kenar ~691 → en yakın 14 katı (686 ya da 700)
		int[] size = DepthMath.modelInputSize(2048, 1536);
		assertThat(size[1]).isEqualTo(518);
		assertThat(size[0] % 14).isZero();
		assertThat(size[1] % 14).isZero();
		assertThat(size[0]).isBetween(686, 700);
	}

	@Test
	void modelInputSizeIsSquareForSquareImagesAndNeverBelow14() {
		assertThat(DepthMath.modelInputSize(1000, 1000)).containsExactly(518, 518);
		int[] tiny = DepthMath.modelInputSize(1, 1);
		assertThat(tiny[0] % 14).isZero();
		assertThat(tiny[0]).isGreaterThanOrEqualTo(14);
	}

	@Test
	void modelInputSizeCapsVeryWideImages() {
		// 5120x2048 (dolgulu panorama): 518 kısa kenar → uzun 1295, tavan altında
		int[] pano = DepthMath.modelInputSize(5120, 2048);
		assertThat(pano[1]).isEqualTo(518);
		assertThat(pano[0]).isBetween(1288, 1302);
		// 10:1 şerit: uzun kenar tavanı aşılmaz
		int[] strip = DepthMath.modelInputSize(10000, 1000);
		assertThat(strip[0]).isLessThanOrEqualTo(DepthMath.MAX_LONG_SIDE);
		assertThat(strip[0] % 14).isZero();
		assertThat(strip[1] % 14).isZero();
	}

	@Test
	void modelInputSizeRejectsEmpty() {
		assertThatThrownBy(() -> DepthMath.modelInputSize(0, 10)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void toNchwNormalizesWithImageNetStatsInChannelPlanes() {
		int[] rgb = {0xFF0000, 0x00FF00, 0x0000FF, 0xFFFFFF};
		float[] out = DepthMath.toNchw(rgb, 2, 2);
		assertThat(out).hasSize(12);
		// R düzlemi: [1,0,0,1]
		assertThat(out[0]).isCloseTo((1f - 0.485f) / 0.229f, within(1e-5f));
		assertThat(out[1]).isCloseTo((0f - 0.485f) / 0.229f, within(1e-5f));
		assertThat(out[3]).isCloseTo((1f - 0.485f) / 0.229f, within(1e-5f));
		// G düzlemi: [0,1,0,1]
		assertThat(out[4]).isCloseTo((0f - 0.456f) / 0.224f, within(1e-5f));
		assertThat(out[5]).isCloseTo((1f - 0.456f) / 0.224f, within(1e-5f));
		// B düzlemi: [0,0,1,1]
		assertThat(out[10]).isCloseTo((1f - 0.406f) / 0.225f, within(1e-5f));
		assertThat(out[8]).isCloseTo((0f - 0.406f) / 0.225f, within(1e-5f));
	}

	@Test
	void resizeBilinearKeepsConstantsAndInterpolatesRamps() {
		DepthMap constant = map(2, 2, 5, 5, 5, 5);
		assertThat(DepthMath.resizeBilinear(constant, 6, 4).values()).containsOnly(5f);

		DepthMap ramp = map(2, 1, 0, 10);
		DepthMap up = DepthMath.resizeBilinear(ramp, 4, 1);
		assertThat(up.values()[0]).isCloseTo(0f, within(1e-5f));
		assertThat(up.values()[3]).isCloseTo(10f, within(1e-5f));
		assertThat(up.values()[1]).isLessThan(up.values()[2]);

		assertThat(DepthMath.resizeBilinear(ramp, 2, 1)).isSameAs(ramp);
	}

	@Test
	void cropColumnsRemovesPaddingFromBothSides() {
		DepthMap m = map(6, 2, 0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15);
		DepthMap c = DepthMath.cropColumns(m, 1);
		assertThat(c.width()).isEqualTo(4);
		assertThat(c.values()).containsExactly(1, 2, 3, 4, 11, 12, 13, 14);
		assertThatThrownBy(() -> DepthMath.cropColumns(m, 3)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void wrapPadColumnsIsOneEighthOfWidth() {
		assertThat(DepthMath.wrapPadColumns(4096, 0.125)).isEqualTo(512);
		assertThat(DepthMath.wrapPadColumns(4, 0.125)).isEqualTo(1);
	}

	@Test
	void normalizeMapsNearestToWhiteAndFarthestToBlack() {
		DepthMap m = map(4, 1, 2f, 4f, 6f, 10f);
		byte[] g = DepthMath.normalizeToGray(m);
		assertThat(g[0] & 0xFF).isEqualTo(0);
		assertThat(g[3] & 0xFF).isEqualTo(255);
		assertThat(g[1] & 0xFF).isLessThan(g[2] & 0xFF);
		assertThat(g[2] & 0xFF).isEqualTo(Math.round(4f / 8f * 255f));
	}

	@Test
	void normalizeHandlesFlatAndNonFiniteValues() {
		assertThat(DepthMath.normalizeToGray(map(2, 1, 3f, 3f))).containsExactly((byte) 128, (byte) 128);
		byte[] g = DepthMath.normalizeToGray(map(3, 1, 0f, Float.NaN, 1f));
		assertThat(g[0] & 0xFF).isEqualTo(0);
		assertThat(g[1] & 0xFF).isEqualTo(0);
		assertThat(g[2] & 0xFF).isEqualTo(255);
		assertThat(DepthMath.normalizeToGray(map(1, 1, Float.NaN))).containsExactly((byte) 0);
	}

	/** 0..100 (101 değer) tek satır: 1. yüzdelik = 1, 99. yüzdelik = 99 tam çıkar. */
	private static DepthMap ramp101() {
		float[] v = new float[101];
		for (int i = 0; i < v.length; i++) {
			v[i] = i;
		}
		return new DepthMap(101, 1, v);
	}

	private static int gray(byte[] g, int i) {
		return g[i] & 0xFF;
	}

	@Test
	void legacyNormalizeEqualsRobustWithMinMaxParameters() {
		DepthMap m = map(3, 2, 5f, -2f, 9f, Float.NaN, 0f, 1.5f);
		assertThat(DepthMath.normalizeToGray(m)).containsExactly(DepthMath.normalizeToGray(m, 0, 0, 100, 1));
	}

	@Test
	void percentileInterpolatesLinearlyBetweenRanks() {
		float[] sorted = {0f, 10f, 20f, 30f};
		assertThat(DepthMath.percentile(sorted, 0)).isEqualTo(0);
		assertThat(DepthMath.percentile(sorted, 100)).isEqualTo(30);
		assertThat(DepthMath.percentile(sorted, 50)).isCloseTo(15, within(1e-9));
		assertThat(DepthMath.percentile(new float[] {7f}, 99)).isEqualTo(7);
	}

	@Test
	void percentileClipIgnoresOutliersAndClampsToBounds() {
		DepthMap m = ramp101();
		m.values()[100] = 10_000f; // tek uç değer (ör. kameranın dibindeki zemin)
		byte[] g = DepthMath.normalizeToGray(m, 0, 1, 99, 1);
		// sınırlar: 1 → 0, 99 → 255; altı ve üstü kırpılır
		assertThat(gray(g, 0)).isZero();
		assertThat(gray(g, 1)).isZero();
		assertThat(gray(g, 99)).isEqualTo(255);
		assertThat(gray(g, 100)).isEqualTo(255);
		assertThat(gray(g, 50)).isEqualTo((int) Math.round(49.0 / 98 * 255));
		// min-max'ta uç değer ölçeği yutar: orta değer neredeyse siyah
		assertThat(gray(DepthMath.normalizeToGray(m, 0, 0, 100, 1), 50)).isLessThan(3);
	}

	@Test
	void gammaBelowOneLiftsMidTonesAndKeepsEnds() {
		DepthMap m = ramp101();
		byte[] linear = DepthMath.normalizeToGray(m, 0, 0, 100, 1);
		byte[] lifted = DepthMath.normalizeToGray(m, 0, 0, 100, 0.5);
		assertThat(gray(linear, 25)).isEqualTo(64);
		assertThat(gray(lifted, 25)).isEqualTo(128); // 0.25^0.5 = 0.5
		assertThat(gray(lifted, 0)).isZero();
		assertThat(gray(lifted, 100)).isEqualTo(255);
		for (int i = 1; i < 100; i++) {
			assertThat(gray(lifted, i)).isGreaterThanOrEqualTo(gray(linear, i));
			assertThat(gray(lifted, i)).isGreaterThanOrEqualTo(gray(lifted, i - 1));
		}
	}

	@Test
	void bottomStripIsExcludedFromStatisticsButStillWritten() {
		// 4x10: üst 8 satır 0..7 (satır başına sabit), alt 2 satır (%20) çok yakın zemin
		int w = 4;
		int h = 10;
		float[] v = new float[w * h];
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < w; x++) {
				v[y * w + x] = y < 8 ? y : 1000f + y;
			}
		}
		DepthMap m = new DepthMap(w, h, v);
		byte[] excluded = DepthMath.normalizeToGray(m, 0.2, 0, 100, 1);
		assertThat(gray(excluded, 0)).isZero();
		assertThat(gray(excluded, 7 * w)).isEqualTo(255); // üst bölgenin en yakını tam beyaz
		assertThat(gray(excluded, 4 * w)).isEqualTo((int) Math.round(4.0 / 7 * 255));
		assertThat(gray(excluded, 8 * w)).isEqualTo(255); // zemin kırpılır, yine yazılır
		assertThat(gray(excluded, 9 * w + 3)).isEqualTo(255);
		// hariç tutmadan: binalar bandı koyuya sıkışır
		byte[] all = DepthMath.normalizeToGray(m, 0, 0, 100, 1);
		assertThat(gray(all, 7 * w)).isLessThan(3);
	}

	@Test
	void stripCoveringWholeMapFallsBackToAllRows() {
		// 1 satır, şerit 0.9 → yuvarlanınca tüm satırlar; istatistik tüm haritaya düşer
		byte[] g = DepthMath.normalizeToGray(map(3, 1, 0f, 5f, 10f), 0.9, 0, 100, 1);
		assertThat(g).containsExactly((byte) 0, (byte) 128, (byte) 255);
	}

	@Test
	void flatStatisticsRegionFallsBackToFullMinMax() {
		// üst satırlar düz (yüzdelikler çakışır) → tüm haritanın min-max'ı kullanılır
		DepthMap m = map(2, 4, 3f, 3f, 3f, 3f, 3f, 3f, 5f, 7f);
		byte[] g = DepthMath.normalizeToGray(m, 0.25, 1, 99, 1);
		assertThat(gray(g, 0)).isZero();
		assertThat(gray(g, 6)).isEqualTo(128);
		assertThat(gray(g, 7)).isEqualTo(255);
		// tamamen düz → 128, sonlu olmayan → 0
		assertThat(DepthMath.normalizeToGray(map(3, 1, 2f, 2f, Float.NaN), 0, 1, 99, 0.7))
			.containsExactly((byte) 128, (byte) 128, (byte) 0);
	}

	@Test
	void nonFiniteValuesBecomeZeroAndDoNotAffectStatistics() {
		DepthMap m = map(6, 1, Float.NaN, 0f, Float.POSITIVE_INFINITY, 5f, Float.NEGATIVE_INFINITY, 10f);
		byte[] g = DepthMath.normalizeToGray(m, 0, 0, 100, 0.7);
		assertThat(gray(g, 0)).isZero();
		assertThat(gray(g, 2)).isZero();
		assertThat(gray(g, 4)).isZero();
		assertThat(gray(g, 1)).isZero();
		assertThat(gray(g, 5)).isEqualTo(255);
		assertThat(gray(g, 3)).isEqualTo((int) Math.round(Math.pow(0.5, 0.7) * 255));
		// stat bölgesi tamamen sonlu değil → tüm haritaya düşülür
		byte[] fallback = DepthMath.normalizeToGray(map(2, 2, Float.NaN, Float.NaN, 1f, 3f), 0.5, 0, 100, 1);
		assertThat(fallback).containsExactly((byte) 0, (byte) 0, (byte) 0, (byte) 255);
		assertThat(DepthMath.normalizeToGray(map(2, 1, Float.NaN, Float.NaN), 0.15, 1, 99, 0.7))
			.containsExactly((byte) 0, (byte) 0);
	}

	@Test
	void robustNormalizeIsMonotonicAndSpansFullScale() {
		java.util.Random random = new java.util.Random(66);
		int w = 64;
		int h = 32;
		float[] v = new float[w * h];
		for (int i = 0; i < v.length; i++) {
			v[i] = (float) (random.nextGaussian() * 50 + (i / w >= 27 ? 5000 : 0));
		}
		DepthMap m = new DepthMap(w, h, v);
		byte[] g = DepthMath.normalizeToGray(m, 0.15, 1, 99, 0.7);
		int min = 255;
		int max = 0;
		for (int i = 0; i < g.length; i++) {
			min = Math.min(min, gray(g, i));
			max = Math.max(max, gray(g, i));
			for (int j = 0; j < g.length; j += 97) {
				if (v[i] > v[j]) {
					assertThat(gray(g, i)).isGreaterThanOrEqualTo(gray(g, j));
				}
			}
		}
		assertThat(min).isZero();
		assertThat(max).isEqualTo(255);
	}

	@Test
	void robustNormalizeRejectsInvalidParameters() {
		DepthMap m = ramp101();
		assertThatThrownBy(() -> DepthMath.normalizeToGray(m, -0.1, 1, 99, 1)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> DepthMath.normalizeToGray(m, 1, 1, 99, 1)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> DepthMath.normalizeToGray(m, 0, 50, 50, 1)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> DepthMath.normalizeToGray(m, 0, -1, 99, 1)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> DepthMath.normalizeToGray(m, 0, 1, 101, 1)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> DepthMath.normalizeToGray(m, 0, 1, 99, 0)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> DepthMath.normalizeToGray(m, 0, 1, 99, Double.NaN)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new DepthNormalization(0.15, 99, 1, 0.7)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void defaultNormalizationMatchesMeasuredChoice() {
		DepthNormalization n = DepthNormalization.defaults();
		assertThat(n.panoramaExcludeBottom()).isEqualTo(0.15);
		assertThat(n.lowPercentile()).isEqualTo(1);
		assertThat(n.highPercentile()).isEqualTo(99);
		assertThat(n.gamma()).isEqualTo(0.7);
	}

	@Test
	void smoothPolesMakesExtremeRowsConstantAndLeavesMiddleAlone() {
		int w = 4;
		int h = 20;
		float[] v = new float[w * h];
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < w; x++) {
				v[y * w + x] = x * 10 + y;
			}
		}
		DepthMap out = DepthMath.smoothPoles(new DepthMap(w, h, v), 0.05);
		// 20 satırın %5'i = 1 satır: uç satırlar satır ortalaması, ortası aynı
		for (int x = 1; x < w; x++) {
			assertThat(out.at(x, 0)).isCloseTo(out.at(0, 0), within(1e-4f));
			assertThat(out.at(x, h - 1)).isCloseTo(out.at(0, h - 1), within(1e-4f));
		}
		assertThat(out.at(0, 0)).isCloseTo(15f, within(1e-4f));
		assertThat(out.at(2, 10)).isEqualTo(v[10 * w + 2]);
	}

	@Test
	void smoothPolesBlendsGraduallyInsideTheBand() {
		int w = 4;
		int h = 100;
		float[] v = new float[w * h];
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < w; x++) {
				v[y * w + x] = x * 10;
			}
		}
		DepthMap out = DepthMath.smoothPoles(new DepthMap(w, h, v), 0.05);
		float spreadRow0 = out.at(3, 0) - out.at(0, 0);
		float spreadRow2 = out.at(3, 2) - out.at(0, 2);
		float spreadRow4 = out.at(3, 4) - out.at(0, 4);
		assertThat(spreadRow0).isCloseTo(0f, within(1e-4f));
		assertThat(spreadRow2).isGreaterThan(spreadRow0);
		assertThat(spreadRow4).isGreaterThan(spreadRow2);
		assertThat(out.at(3, 5) - out.at(0, 5)).isCloseTo(30f, within(1e-4f));
	}

	@Test
	void seamRatioIsSmallForPeriodicContentAndLargeForAJump() {
		int w = 64;
		float[] periodic = new float[w * 2];
		float[] jump = new float[w * 2];
		for (int y = 0; y < 2; y++) {
			for (int x = 0; x < w; x++) {
				periodic[y * w + x] = (float) Math.sin(2 * Math.PI * x / w);
				jump[y * w + x] = (float) x / w;
			}
		}
		assertThat(DepthMath.seamRatio(new DepthMap(w, 2, periodic))).isLessThanOrEqualTo(DepthMath.SEAM_LIMIT);
		assertThat(DepthMath.seamRatio(new DepthMap(w, 2, jump))).isGreaterThan(DepthMath.SEAM_LIMIT);
	}

	@Test
	void seamRatioOnFlatMaps() {
		assertThat(DepthMath.seamRatio(map(3, 1, 1f, 1f, 1f))).isZero();
		assertThat(DepthMath.seamRatio(map(3, 1, 1f, 1f, 1f))).isLessThanOrEqualTo(DepthMath.SEAM_LIMIT);
	}
}
