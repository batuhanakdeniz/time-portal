package com.timeportal.depth;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class DepthPipelineTest {

	/** Parlaklığı ters derinlik sayan sahte tahminci: açık piksel = yakın. Çağrıları kaydeder. */
	static class LuminanceEstimator implements DepthEstimator {
		final List<int[]> sizes = new ArrayList<>();
		/** Doluysa girdinin ilk ve son sütununu bozar (modelin kenar artefaktını taklit eder). */
		boolean edgeArtifacts;

		@Override
		public DepthMap estimate(BufferedImage image) {
			int w = image.getWidth();
			int h = image.getHeight();
			sizes.add(new int[] {w, h});
			float[] v = new float[w * h];
			for (int y = 0; y < h; y++) {
				for (int x = 0; x < w; x++) {
					int p = image.getRGB(x, y);
					v[y * w + x] = (p & 0xFF) / 255f;
				}
			}
			if (edgeArtifacts) {
				for (int y = 0; y < h; y++) {
					v[y * w] = 0f;
					v[y * w + w - 1] = 1f;
				}
			}
			return new DepthMap(w, h, v);
		}
	}

	private static BufferedImage periodicPanorama(int w, int h) {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < w; x++) {
				int v = (int) Math.round(127.5 + 100 * Math.sin(2 * Math.PI * x / w) + 20 * Math.sin(2 * Math.PI * y / h));
				img.setRGB(x, y, (v << 16) | (v << 8) | v);
			}
		}
		return img;
	}

	@Test
	void limitShrinksWidePanoramaToMaxWidthKeepingAspect() {
		BufferedImage big = new BufferedImage(8192, 4096, BufferedImage.TYPE_INT_RGB);
		BufferedImage out = DepthPipeline.limit(big, true);
		assertThat(out.getWidth()).isEqualTo(4096);
		assertThat(out.getHeight()).isEqualTo(2048);
	}

	@Test
	void limitCapsPhotoLongSideAt2048AndNeverEnlarges() {
		BufferedImage photo = new BufferedImage(4000, 3000, BufferedImage.TYPE_INT_RGB);
		BufferedImage out = DepthPipeline.limit(photo, false);
		assertThat(out.getWidth()).isEqualTo(2048);
		assertThat(out.getHeight()).isEqualTo(1536);

		BufferedImage small = new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB);
		assertThat(DepthPipeline.limit(small, false)).isSameAs(small);
		BufferedImage pano = new BufferedImage(2048, 1024, BufferedImage.TYPE_INT_RGB);
		assertThat(DepthPipeline.limit(pano, true)).isSameAs(pano);
	}

	@Test
	void wrapPadAddsColumnsFromTheOppositeEdge() {
		BufferedImage img = new BufferedImage(4, 1, BufferedImage.TYPE_INT_RGB);
		for (int x = 0; x < 4; x++) {
			img.setRGB(x, 0, x + 1);
		}
		BufferedImage padded = DepthPipeline.wrapPad(img, 2);
		assertThat(padded.getWidth()).isEqualTo(8);
		int[] blue = new int[8];
		for (int x = 0; x < 8; x++) {
			blue[x] = padded.getRGB(x, 0) & 0xFF;
		}
		assertThat(blue).containsExactly(3, 4, 1, 2, 3, 4, 1, 2);
	}

	@Test
	void panoramaIsEstimatedWithWrapPaddingAndReturnedAtOriginalWidth() {
		LuminanceEstimator estimator = new LuminanceEstimator();
		BufferedImage pano = periodicPanorama(160, 80);

		DepthMap map = new DepthPipeline(estimator).depth(pano, true);

		assertThat(estimator.sizes).hasSize(1);
		assertThat(estimator.sizes.get(0)[0]).isEqualTo(160 + 2 * 20);
		assertThat(map.width()).isEqualTo(160);
		assertThat(map.height()).isEqualTo(80);
	}

	@Test
	void photoIsEstimatedWithoutPadding() {
		LuminanceEstimator estimator = new LuminanceEstimator();
		new DepthPipeline(estimator).depth(periodicPanorama(100, 60), false);
		assertThat(estimator.sizes.get(0)).containsExactly(100, 60);
	}

	@Test
	void wrapPaddingKeepsSeamWithinLimitEvenWhenTheModelMisbehavesAtItsEdges() {
		LuminanceEstimator estimator = new LuminanceEstimator();
		estimator.edgeArtifacts = true;
		BufferedImage pano = periodicPanorama(320, 160);

		DepthMap withPadding = new DepthPipeline(estimator).depth(pano, true);
		double seam = DepthMath.seamRatio(withPadding);
		assertThat(seam).isLessThanOrEqualTo(DepthMath.SEAM_LIMIT);

		// Karşı örnek: dolgusuz çıkarım aynı kenar artefaktıyla kabul ölçütünü aşar (ölçüt anlamlı).
		double without = DepthMath.seamRatio(estimator.estimate(pano));
		assertThat(without).isGreaterThan(DepthMath.SEAM_LIMIT);
	}

	@Test
	void polesAreSmoothedToASingleValuePerExtremeRow() {
		LuminanceEstimator estimator = new LuminanceEstimator();
		DepthMap map = new DepthPipeline(estimator).depth(periodicPanorama(160, 100), true);
		for (int x = 1; x < map.width(); x++) {
			assertThat(map.at(x, 0)).isEqualTo(map.at(0, 0));
			assertThat(map.at(x, map.height() - 1)).isEqualTo(map.at(0, map.height() - 1));
		}
	}

	@Test
	void depthPngIsGrayscaleSameSizeAndBrightIsNear() throws IOException {
		// Sol yarı koyu (uzak), sağ yarı açık (yakın) fotoğraf
		BufferedImage img = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
		for (int y = 0; y < 20; y++) {
			for (int x = 0; x < 40; x++) {
				int v = x < 20 ? 30 : 220;
				img.setRGB(x, y, (v << 16) | (v << 8) | v);
			}
		}
		byte[] png = new DepthPipeline(new LuminanceEstimator()).depthPng(img, false);

		BufferedImage out = ImageIO.read(new ByteArrayInputStream(png));
		assertThat(out.getType()).isEqualTo(BufferedImage.TYPE_BYTE_GRAY);
		assertThat(out.getWidth()).isEqualTo(40);
		assertThat(out.getHeight()).isEqualTo(20);
		int far = out.getRaster().getSample(5, 10, 0);
		int near = out.getRaster().getSample(35, 10, 0);
		assertThat(far).isEqualTo(0);
		assertThat(near).isEqualTo(255);
	}

	@Test
	void depthPngResizesEstimatorOutputToImageSize() throws IOException {
		DepthEstimator smallOutput = image -> new DepthMap(2, 2, new float[] {0, 1, 2, 3});
		byte[] png = new DepthPipeline(smallOutput).depthPng(new BufferedImage(10, 6, BufferedImage.TYPE_INT_RGB), false);
		BufferedImage out = ImageIO.read(new ByteArrayInputStream(png));
		assertThat(out.getWidth()).isEqualTo(10);
		assertThat(out.getHeight()).isEqualTo(6);
	}
}
