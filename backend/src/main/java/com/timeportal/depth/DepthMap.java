package com.timeportal.depth;

/**
 * Satır öncelikli (row-major) tek kanallı kayan noktalı harita. {@link DepthEstimator} çıktısında
 * değerler göreli ters derinliktir: büyük değer = yakın. Ölçeği belirsizdir (görsel başına min-max
 * ile normalize edilir).
 */
public record DepthMap(int width, int height, float[] values) {

	public DepthMap {
		if (width < 1 || height < 1) {
			throw new IllegalArgumentException("width and height must be positive");
		}
		if (values.length != width * height) {
			throw new IllegalArgumentException("values length must equal width*height");
		}
	}

	public float at(int x, int y) {
		return values[y * width + x];
	}
}
