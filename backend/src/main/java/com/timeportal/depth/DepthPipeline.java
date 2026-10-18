package com.timeportal.depth;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import javax.imageio.ImageIO;

/**
 * Görsel → derinlik PNG'si hattı: boyut sınırı, (panoramada) sarmalı dolgu, çıkarım, kırpma, kutup
 * yumuşatma, min-max normalizasyon (açık = yakın, #5 Karar 4A) ve gri PNG kodlama. Çıkarımı
 * {@link DepthEstimator} yapar; bu sınıf modelden bağımsızdır.
 */
public class DepthPipeline {

	/** Panorama genişlik sınırı (frontend mobil doku sınırı). */
	public static final int MAX_PANORAMA_WIDTH = 4096;
	/** Fotoğraf uzun kenar sınırı. */
	public static final int MAX_PHOTO_LONG_SIDE = 2048;
	/** Dikiş sürekliliği için iki yandan eklenen sarmalı dolgu: genişliğin oranı. */
	public static final double WRAP_PAD_FRACTION = 0.125;
	/** Kutup yumuşatma şeridi: üst ve alttan yükseklik oranı. */
	public static final double POLE_FRACTION = 0.05;

	private final DepthEstimator estimator;

	public DepthPipeline(DepthEstimator estimator) {
		this.estimator = estimator;
	}

	/** Görseli tür sınırlarına küçültür (büyütmez). Sınır içindeyse aynı nesneyi döner. */
	public static BufferedImage limit(BufferedImage image, boolean panorama) {
		int w = image.getWidth();
		int h = image.getHeight();
		double scale = panorama ? Math.min(1.0, (double) MAX_PANORAMA_WIDTH / w)
				: Math.min(1.0, (double) MAX_PHOTO_LONG_SIDE / Math.max(w, h));
		if (scale >= 1.0) {
			return image;
		}
		return resize(image, Math.max(1, (int) Math.round(w * scale)), Math.max(1, (int) Math.round(h * scale)));
	}

	/**
	 * Derinlik haritası (göreli, büyük = yakın) üretir. Panoramada çıkarımdan önce yatayda sarmalı dolgu
	 * eklenir ve sonra kırpılır; böylece 0°/360° dikişinde süreklilik sağlanır, kutuplar yumuşatılır.
	 */
	public DepthMap depth(BufferedImage image, boolean panorama) {
		if (!panorama) {
			return estimator.estimate(image);
		}
		int pad = DepthMath.wrapPadColumns(image.getWidth(), WRAP_PAD_FRACTION);
		DepthMap padded = estimator.estimate(wrapPad(image, pad));
		DepthMap cropped = DepthMath.cropColumns(padded, pad);
		return DepthMath.smoothPoles(cropped, POLE_FRACTION);
	}

	/** {@link #depth} sonucunu gri PNG'ye çevirir (açık = yakın), kaynak görselle aynı boyutta. */
	public byte[] depthPng(BufferedImage image, boolean panorama) {
		DepthMap map = depth(image, panorama);
		if (map.width() != image.getWidth() || map.height() != image.getHeight()) {
			map = DepthMath.resizeBilinear(map, image.getWidth(), image.getHeight());
		}
		return grayPng(DepthMath.normalizeToGray(map), map.width(), map.height());
	}

	/** Görselin sağ ucundaki sütunları sola, sol ucundakileri sağa ekler (equirectangular sarma). */
	static BufferedImage wrapPad(BufferedImage image, int pad) {
		int w = image.getWidth();
		int h = image.getHeight();
		BufferedImage out = new BufferedImage(w + 2 * pad, h, BufferedImage.TYPE_INT_RGB);
		int[] row = new int[w];
		int[] padded = new int[w + 2 * pad];
		for (int y = 0; y < h; y++) {
			image.getRGB(0, y, w, 1, row, 0, w);
			for (int x = 0; x < padded.length; x++) {
				padded[x] = row[Math.floorMod(x - pad, w)];
			}
			out.setRGB(0, y, padded.length, 1, padded, 0, padded.length);
		}
		return out;
	}

	static byte[] grayPng(byte[] gray, int width, int height) {
		BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
		img.getRaster().setDataElements(0, 0, width, height, gray);
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try {
			ImageIO.write(img, "png", out);
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		return out.toByteArray();
	}

	/** Küçültmede yarıya bölerek (alias azaltır), son adımda bilinear ile yeniden boyutlandırır. */
	static BufferedImage resize(BufferedImage src, int w, int h) {
		BufferedImage current = toRgb(src);
		while (current.getWidth() / 2 >= w && current.getHeight() / 2 >= h) {
			current = draw(current, current.getWidth() / 2, current.getHeight() / 2);
		}
		return draw(current, w, h);
	}

	private static BufferedImage toRgb(BufferedImage src) {
		if (src.getType() == BufferedImage.TYPE_INT_RGB) {
			return src;
		}
		return draw(src, src.getWidth(), src.getHeight());
	}

	private static BufferedImage draw(BufferedImage src, int w, int h) {
		BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = out.createGraphics();
		try {
			g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
			g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
			g.drawImage(src, 0, 0, w, h, null);
		}
		finally {
			g.dispose();
		}
		return out;
	}
}
