package com.timeportal.depth;

import java.util.Arrays;

/** Derinlik hattının saf (durumsuz) sayısal işlevleri. Hepsi küçük sentetik dizilerle test edilir. */
public final class DepthMath {

	/** Modelin girdi kenarları 14'ün katı olmalı (ViT yama boyutu). */
	public static final int MULTIPLE = 14;
	/** Girdi kısa kenarı hedefi. */
	public static final int TARGET_SHORT_SIDE = 518;
	/** Çok geniş girdilerde işlem yükünü sınırlayan uzun kenar tavanı (14'ün katı). */
	public static final int MAX_LONG_SIDE = 1568;
	/** Dikiş kabul sınırı: kenar farkı, iç komşu farkının en çok 2 katı. */
	public static final double SEAM_LIMIT = 2.0;

	static final float[] MEAN = {0.485f, 0.456f, 0.406f};
	static final float[] STD = {0.229f, 0.224f, 0.225f};

	private DepthMath() {
	}

	/** Model girdi boyutu {genişlik, yükseklik}: kısa kenar ~518, ikisi de 14'ün katı, uzun kenar tavanlı. */
	public static int[] modelInputSize(int width, int height) {
		if (width < 1 || height < 1) {
			throw new IllegalArgumentException("image size must be positive");
		}
		double scale = (double) TARGET_SHORT_SIDE / Math.min(width, height);
		double longSide = Math.max(width, height) * scale;
		if (longSide > MAX_LONG_SIDE) {
			scale *= MAX_LONG_SIDE / longSide;
		}
		return new int[] {roundToMultiple(width * scale), roundToMultiple(height * scale)};
	}

	private static int roundToMultiple(double v) {
		return Math.max(MULTIPLE, (int) Math.round(v / MULTIPLE) * MULTIPLE);
	}

	/**
	 * Paketlenmiş RGB piksel dizisi (0xRRGGBB) → NCHW float32: 1/255 ölçekle, ImageNet ortalama/std
	 * ile normalize et. Dönen dizi {@code [3][h][w]} düzleşmiştir.
	 */
	public static float[] toNchw(int[] rgb, int width, int height) {
		int plane = width * height;
		float[] out = new float[3 * plane];
		for (int i = 0; i < plane; i++) {
			int p = rgb[i];
			out[i] = (((p >> 16) & 0xFF) / 255f - MEAN[0]) / STD[0];
			out[plane + i] = (((p >> 8) & 0xFF) / 255f - MEAN[1]) / STD[1];
			out[2 * plane + i] = ((p & 0xFF) / 255f - MEAN[2]) / STD[2];
		}
		return out;
	}

	/** Bilinear yeniden boyutlandırma (piksel merkezi hizalı, kenarlar sıkıştırılır). */
	public static DepthMap resizeBilinear(DepthMap src, int dw, int dh) {
		if (src.width() == dw && src.height() == dh) {
			return src;
		}
		float[] out = new float[dw * dh];
		double sx = (double) src.width() / dw;
		double sy = (double) src.height() / dh;
		for (int y = 0; y < dh; y++) {
			double fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), src.height() - 1);
			int y0 = (int) fy;
			int y1 = Math.min(y0 + 1, src.height() - 1);
			float wy = (float) (fy - y0);
			for (int x = 0; x < dw; x++) {
				double fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), src.width() - 1);
				int x0 = (int) fx;
				int x1 = Math.min(x0 + 1, src.width() - 1);
				float wx = (float) (fx - x0);
				float top = src.at(x0, y0) * (1 - wx) + src.at(x1, y0) * wx;
				float bottom = src.at(x0, y1) * (1 - wx) + src.at(x1, y1) * wx;
				out[y * dw + x] = top * (1 - wy) + bottom * wy;
			}
		}
		return new DepthMap(dw, dh, out);
	}

	/** Yatay sarmalı dolgu sütun sayısı: genişliğin {@code fraction}'ı (en az 1). */
	public static int wrapPadColumns(int width, double fraction) {
		return Math.max(1, (int) Math.round(width * fraction));
	}

	/** {@code pad} sütunu iki yandan kırpar (sarmalı dolgunun tersi). */
	public static DepthMap cropColumns(DepthMap map, int pad) {
		int w = map.width() - 2 * pad;
		if (pad < 0 || w < 1) {
			throw new IllegalArgumentException("invalid crop");
		}
		float[] out = new float[w * map.height()];
		for (int y = 0; y < map.height(); y++) {
			System.arraycopy(map.values(), y * map.width() + pad, out, y * w, w);
		}
		return new DepthMap(w, map.height(), out);
	}

	/**
	 * Kutup yumuşatma: üst ve alt {@code fraction} şeridinde her satır, satır ortalamasına doğru
	 * karıştırılır; karışım ağırlığı uç satırda 1'dir (kutupta tek değer) ve şeridin iç sınırında 0'a iner.
	 */
	public static DepthMap smoothPoles(DepthMap map, double fraction) {
		int band = (int) Math.ceil(map.height() * fraction);
		if (band < 1) {
			return map;
		}
		float[] out = map.values().clone();
		for (int y = 0; y < map.height(); y++) {
			int distance = Math.min(y, map.height() - 1 - y);
			if (distance >= band) {
				continue;
			}
			float weight = (float) (band - distance) / band;
			double sum = 0;
			for (int x = 0; x < map.width(); x++) {
				sum += map.at(x, y);
			}
			float mean = (float) (sum / map.width());
			for (int x = 0; x < map.width(); x++) {
				int i = y * map.width() + x;
				out[i] = map.values()[i] * (1 - weight) + mean * weight;
			}
		}
		return new DepthMap(map.width(), map.height(), out);
	}

	/**
	 * Min-max ile 0-255'e normalize eder; en büyük değer (en yakın) 255 = açık. Düz haritada (min==max)
	 * 128 döner; sonlu olmayan değerler 0 olur.
	 */
	public static byte[] normalizeToGray(DepthMap map) {
		float min = Float.POSITIVE_INFINITY;
		float max = Float.NEGATIVE_INFINITY;
		for (float v : map.values()) {
			if (Float.isFinite(v)) {
				min = Math.min(min, v);
				max = Math.max(max, v);
			}
		}
		byte[] out = new byte[map.values().length];
		if (!(max > min)) {
			Arrays.fill(out, (byte) (Float.isFinite(max) ? 128 : 0));
			return out;
		}
		float range = max - min;
		for (int i = 0; i < out.length; i++) {
			float v = map.values()[i];
			out[i] = Float.isFinite(v) ? (byte) Math.round((v - min) / range * 255f) : 0;
		}
		return out;
	}

	/**
	 * Dikiş ölçütü: sol ve sağ kenar sütunlarının satır başına ortalama mutlak farkı, görüntü içindeki
	 * komşu sütun farklarının ortalamasına oranı. Süreklilik için en çok {@link #SEAM_LIMIT}. İç fark
	 * sıfırsa (düz harita): kenar farkı da sıfırsa 0, değilse sonsuz.
	 */
	public static double seamRatio(DepthMap map) {
		if (map.width() < 3) {
			throw new IllegalArgumentException("need at least 3 columns");
		}
		double edge = 0;
		for (int y = 0; y < map.height(); y++) {
			edge += Math.abs(map.at(0, y) - map.at(map.width() - 1, y));
		}
		edge /= map.height();
		double inner = 0;
		for (int y = 0; y < map.height(); y++) {
			for (int x = 0; x + 1 < map.width(); x++) {
				inner += Math.abs(map.at(x, y) - map.at(x + 1, y));
			}
		}
		inner /= (double) map.height() * (map.width() - 1);
		if (inner == 0) {
			return edge == 0 ? 0 : Double.POSITIVE_INFINITY;
		}
		return edge / inner;
	}
}
