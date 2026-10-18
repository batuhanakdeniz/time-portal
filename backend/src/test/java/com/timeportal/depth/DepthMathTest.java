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
