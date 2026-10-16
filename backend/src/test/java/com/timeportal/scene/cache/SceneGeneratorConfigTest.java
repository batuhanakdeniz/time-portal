package com.timeportal.scene.cache;

import static org.assertj.core.api.Assertions.assertThat;

import com.timeportal.scene.FakeSceneGenerator;
import com.timeportal.scene.SceneGenerator;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

class SceneGeneratorConfigTest {

	@Nested
	@SpringBootTest
	class Enabled {
		@Autowired
		SceneGenerator generator;

		@Test
		void primaryGeneratorIsCaching() {
			assertThat(generator).isInstanceOf(CachingSceneGenerator.class);
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
}
