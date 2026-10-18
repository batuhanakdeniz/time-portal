package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;

import com.timeportal.artifact.ArtifactStore;
import com.timeportal.artifact.ImageDecoder;
import com.timeportal.artifact.ImageFetcher;
import com.timeportal.depth.DepthEstimator;
import com.timeportal.depth.DepthMap;
import com.timeportal.geo.District;
import com.timeportal.geo.DistrictLocator;
import com.timeportal.image.Attribution;
import com.timeportal.image.CityImage;
import com.timeportal.image.CityImageFinder;
import com.timeportal.image.ImageKind;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.DynamicPropertyRegistry;

/**
 * city-image modunda gerçek bean grafiği; yalnızca dış bağımlılıklar (finder, indirici, tahminci,
 * ilçe bulucu) sahte. Dış bir hücre+yıl önbelleği olmadığını ve ilçe önbelleğinin davranışını doğrular.
 */
@SpringBootTest(properties = "timeportal.generator=city-image")
class CityImageBeanGraphTest {

	static final District A = new District("İstanbul", "Beyoğlu", 41.03, 28.97);
	static final District B = new District("İstanbul", "Şişli", 41.06, 28.99);
	static final AtomicInteger FINDS = new AtomicInteger();
	static final AtomicInteger ESTIMATES = new AtomicInteger();

	static final Path DIR;

	static {
		try {
			DIR = Files.createTempDirectory("tp-graph-artifacts");
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	@DynamicPropertySource
	static void props(DynamicPropertyRegistry registry) {
		registry.add("timeportal.artifacts-dir", DIR::toString);
	}

	@TestConfiguration
	static class Fakes {
		@Bean
		@Primary
		DistrictLocator testLocator() {
			// Aynı 0,01° hücresinde (28.98) iki farklı ilçe: boylam 28.9849'dan küçükse A, değilse B
			return (lat, lon) -> Optional.of(lon < 28.9849 ? A : B);
		}

		@Bean
		@Primary
		CityImageFinder testFinder() {
			return d -> {
				FINDS.incrementAndGet();
				return Optional.of(new CityImage("https://img.test/" + d.name() + ".jpg", ImageKind.PHOTO, 64, 32,
						new Attribution("a", "CC BY 4.0", null, "https://commons.wikimedia.org/wiki/File:" + d.name(),
								Attribution.WIKIMEDIA_COMMONS)));
			};
		}

		@Bean
		@Primary
		ImageFetcher testFetcher() {
			return url -> {
				BufferedImage img = new BufferedImage(64, 32, BufferedImage.TYPE_INT_RGB);
				int seed = url.hashCode();
				for (int y = 0; y < 32; y++) {
					for (int x = 0; x < 64; x++) {
						img.setRGB(x, y, (x * 3 + seed) & 0xFFFFFF);
					}
				}
				ByteArrayOutputStream out = new ByteArrayOutputStream();
				ImageIO.write(img, "jpg", out);
				return ImageDecoder.decode(out.toByteArray());
			};
		}

		@Bean
		@Primary
		DepthEstimator testEstimator() {
			return image -> {
				ESTIMATES.incrementAndGet();
				return new DepthMap(image.getWidth(), image.getHeight(), new float[image.getWidth() * image.getHeight()]);
			};
		}
	}

	@Autowired
	SceneGenerator generator;

	@Autowired
	ArtifactStore store;

	@Test
	void deletedArtifactMakesTheNextCallRecompute() throws IOException {
		SceneRequest request = new SceneRequest(2026, 41.03, 28.9801);
		SceneResult first = generator.generate(request);
		int findsBefore = FINDS.get();
		assertThat(generator.generate(request)).isEqualTo(first);
		assertThat(FINDS).hasValue(findsBefore);

		Files.delete(store.resolve(first.depthUrl().substring("/api/artifacts/".length())).orElseThrow());
		SceneResult second = generator.generate(request);

		assertThat(FINDS).hasValue(findsBefore + 1);
		assertThat(store.exists(second.depthUrl().substring("/api/artifacts/".length()))).isTrue();
	}

	@Test
	void twoDistrictsInTheSameCellGetTheirOwnPlace() {
		SceneResult a = generator.generate(new SceneRequest(2026, 41.04, 28.9810));
		SceneResult b = generator.generate(new SceneRequest(2026, 41.04, 28.9890));

		assertThat(a.place().district()).isEqualTo("Beyoğlu");
		assertThat(b.place().district()).isEqualTo("Şişli");
		assertThat(a.panoramaUrl()).isNotEqualTo(b.panoramaUrl());
	}
}
