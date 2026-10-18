package com.timeportal.depth;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Gerçek model ve ONNX native kütüphanesiyle uçtan uca deneme. CI'da çalışmaz; elle:
 * {@code TIMEPORTAL_REAL_MODEL=1 ./mvnw test -Dtest=RealModelTest} (ilk çalıştırmada ~95 MB indirir).
 */
@EnabledIfEnvironmentVariable(named = "TIMEPORTAL_REAL_MODEL", matches = "1")
class RealModelTest {

	@Test
	void estimatesRelativeInverseDepthAtImageSize() {
		Path dir = Path.of(System.getProperty("user.home"), ".cache", "time-portal", "models");
		try (OnnxDepthEstimator estimator = new OnnxDepthEstimator(new DepthModelStore(dir, new HttpModelDownloader()), 1)) {
			BufferedImage img = new BufferedImage(640, 360, BufferedImage.TYPE_INT_RGB);
			Graphics2D g = img.createGraphics();
			g.setPaint(new java.awt.GradientPaint(0, 0, new Color(40, 40, 60), 0, 360, new Color(200, 200, 190)));
			g.fillRect(0, 0, 640, 360);
			g.setColor(new Color(30, 30, 30));
			g.fillRect(250, 120, 140, 240);
			g.dispose();

			DepthMap map = estimator.estimate(img);

			assertThat(map.width()).isEqualTo(640);
			assertThat(map.height()).isEqualTo(360);
			assertThat(estimator.lastInferenceMillis()).isPositive();
			assertThat(map.values()).doesNotContain(Float.NaN);
		}
	}
}
