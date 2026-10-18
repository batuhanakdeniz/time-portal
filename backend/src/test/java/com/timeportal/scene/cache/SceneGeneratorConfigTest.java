package com.timeportal.scene.cache;

import static org.assertj.core.api.Assertions.assertThat;

import com.timeportal.depth.OnnxDepthEstimator;
import com.timeportal.scene.CityImageSceneGenerator;
import com.timeportal.scene.FakeSceneGenerator;
import com.timeportal.scene.SceneGenerator;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

class SceneGeneratorConfigTest {

	@Nested
	@SpringBootTest
	class Enabled {
		@Autowired
		SceneGenerator generator;

		@Autowired
		ApplicationContext context;

		@Test
		void primaryGeneratorIsCaching() {
			assertThat(generator).isInstanceOf(CachingSceneGenerator.class);
		}

		@Test
		void testsRunWithTheFakeGeneratorAndNeverCreateTheRealOnes() {
			assertThat(context.getBeansOfType(FakeSceneGenerator.class)).hasSize(1);
			assertThat(context.getBeansOfType(CityImageSceneGenerator.class)).isEmpty();
			assertThat(context.getBeansOfType(OnnxDepthEstimator.class)).isEmpty();
		}
	}

	@Nested
	@SpringBootTest(properties = "timeportal.cache.enabled=false")
	class Disabled {
		@Autowired
		SceneGenerator generator;

		@Test
		void primaryGeneratorIsDelegate() {
			assertThat(generator).isInstanceOf(FakeSceneGenerator.class);
		}
	}

	@Nested
	@SpringBootTest(properties = {"timeportal.generator=city-image", "timeportal.cache.enabled=false"})
	class CityImage {
		@Autowired
		SceneGenerator generator;

		@Autowired
		ApplicationContext context;

		@Test
		void cityImageGeneratorIsSelectedWithoutLoadingAnyModel() {
			assertThat(generator).isInstanceOf(CityImageSceneGenerator.class);
			assertThat(context.getBeansOfType(FakeSceneGenerator.class)).isEmpty();
			// Bean var ama model/native yalnızca ilk çıkarımda yüklenir
			assertThat(context.getBeansOfType(OnnxDepthEstimator.class)).hasSize(1);
		}
	}

	@Nested
	@SpringBootTest(properties = "timeportal.generator=city-image")
	class CityImageNotWrapped {
		@Autowired
		SceneGenerator generator;

		@Test
		void realGeneratorIsNotWrappedByTheOuterCellCache() {
			// kendi ilçe önbelleği var; hücre+yıl önbelleği TTL/yapıt varlığı/ilçe doğruluğunu bozardı
			assertThat(generator).isInstanceOf(CityImageSceneGenerator.class);
		}
	}
}
