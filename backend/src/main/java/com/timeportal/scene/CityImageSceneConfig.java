package com.timeportal.scene;

import com.timeportal.artifact.ArtifactStore;
import com.timeportal.artifact.HttpImageFetcher;
import com.timeportal.artifact.ImageFetcher;
import com.timeportal.depth.DepthEstimator;
import com.timeportal.depth.DepthModelStore;
import com.timeportal.depth.DepthNormalization;
import com.timeportal.depth.DepthPipeline;
import com.timeportal.depth.HttpModelDownloader;
import com.timeportal.depth.OnnxDepthEstimator;
import com.timeportal.geo.DistrictLocator;
import com.timeportal.image.CityImageFinder;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Gerçek üreticiyi ({@code timeportal.generator=city-image}, varsayılan) ve ona ait tahminci/indirici
 * bean'lerini kurar. {@code fake} seçiliyse bu sınıf yüklenmez: ONNX native kütüphanesi testlerde
 * ve CI'da hiç yüklenmez (tahminci zaten ilk çıkarımda tembel yükler).
 */
@Configuration
@ConditionalOnProperty(name = "timeportal.generator", havingValue = "city-image", matchIfMissing = true)
class CityImageSceneConfig {

	@Bean
	DepthEstimator depthEstimator(
			@Value("${timeportal.depth.model-dir:${user.home}/.cache/time-portal/models}") String modelDir,
			@Value("${timeportal.depth.max-concurrent:1}") int maxConcurrent) {
		return new OnnxDepthEstimator(new DepthModelStore(Path.of(modelDir), new HttpModelDownloader(DepthModelStore.EXPECTED_SIZE + DepthModelStore.EXPECTED_SIZE / 100)), maxConcurrent);
	}

	/**
	 * Derinlik griye çevrilirken ölçek ayarları (#66). {@code exclude-bottom} yalnızca panoramada
	 * uygulanır; fotoğrafta yüzdelik kırpma ve gamma uygulanır. Geçersiz değer başlangıçta hata verir.
	 */
	@Bean
	DepthNormalization depthNormalization(
			@Value("${timeportal.depth.normalize.exclude-bottom:" + DepthNormalization.DEFAULT_EXCLUDE_BOTTOM + "}") double excludeBottom,
			@Value("${timeportal.depth.normalize.low-pct:" + DepthNormalization.DEFAULT_LOW_PERCENTILE + "}") double lowPct,
			@Value("${timeportal.depth.normalize.high-pct:" + DepthNormalization.DEFAULT_HIGH_PERCENTILE + "}") double highPct,
			@Value("${timeportal.depth.normalize.gamma:" + DepthNormalization.DEFAULT_GAMMA + "}") double gamma) {
		return new DepthNormalization(excludeBottom, lowPct, highPct, gamma);
	}

	@Bean
	ImageFetcher imageFetcher(
			@Value("${timeportal.artifacts.allowed-hosts:"+HttpImageFetcher.DEFAULT_ALLOWED_HOSTS+"}") List<String> allowedHosts) {
		return new HttpImageFetcher(allowedHosts);
	}

	@Bean
	CityImageSceneGenerator cityImageSceneGenerator(DistrictLocator locator, CityImageFinder finder,
			ImageFetcher fetcher, DepthEstimator estimator, DepthNormalization normalization, ArtifactStore store,
			@Value("${timeportal.scene.district-ttl:PT24H}") Duration ttl,
			@Value("${timeportal.scene.degraded-ttl:PT5M}") Duration degradedTtl,
			@Value("${timeportal.scene.max-districts:1000}") int maxDistricts,
			@Value("${timeportal.scene.wait-timeout:PT120S}") Duration waitTimeout) {
		return new CityImageSceneGenerator(locator, finder, fetcher, new DepthPipeline(estimator, normalization), store,
				Clock.systemUTC(), ttl, degradedTtl, maxDistricts, waitTimeout);
	}
}
