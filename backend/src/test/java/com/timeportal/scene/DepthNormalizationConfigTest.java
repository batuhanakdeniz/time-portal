package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;

import com.timeportal.depth.DepthNormalization;
import com.timeportal.depth.DepthPipeline;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;

/** {@code timeportal.depth.normalize.*} özellikleri gerçek üreticinin derinlik hattına ulaşır (#66). */
class DepthNormalizationConfigTest {

	private static DepthNormalization pipelineNormalization(CityImageSceneGenerator generator) {
		DepthPipeline pipeline = (DepthPipeline) ReflectionTestUtils.getField(generator, "pipeline");
		return pipeline.normalization();
	}

	@Nested
	@SpringBootTest(properties = {"timeportal.generator=city-image", "timeportal.depth.normalize.exclude-bottom=0.3",
			"timeportal.depth.normalize.low-pct=2", "timeportal.depth.normalize.high-pct=97.5",
			"timeportal.depth.normalize.gamma=0.5"})
	class Configured {
		@Autowired
		DepthNormalization normalization;

		@Autowired
		CityImageSceneGenerator generator;

		@Test
		void propertiesBindToNormalizationAndReachThePipeline() {
			assertThat(normalization).isEqualTo(new DepthNormalization(0.3, 2, 97.5, 0.5));
			assertThat(pipelineNormalization(generator)).isEqualTo(normalization);
		}
	}

	@Nested
	@SpringBootTest(properties = "timeportal.generator=city-image")
	class Defaults {
		@Autowired
		CityImageSceneGenerator generator;

		@Test
		void withoutPropertiesTheMeasuredDefaultsAreUsed() {
			assertThat(pipelineNormalization(generator)).isEqualTo(DepthNormalization.defaults());
		}
	}
}
