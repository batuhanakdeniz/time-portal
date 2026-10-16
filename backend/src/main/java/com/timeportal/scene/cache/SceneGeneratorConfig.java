package com.timeportal.scene.cache;

import com.timeportal.scene.FakeSceneGenerator;
import com.timeportal.scene.SceneGenerator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * Enjekte edilen {@link SceneGenerator}'ı belirler: önbellekli sarmalayıcı (varsayılan) ya da
 * {@code timeportal.cache.enabled=false} ile doğrudan delege.
 */
@Configuration
public class SceneGeneratorConfig {

	@Bean
	@Primary
	SceneGenerator cachedSceneGenerator(FakeSceneGenerator delegate,
			@Value("${timeportal.cache.enabled:true}") boolean enabled,
			@Value("${timeportal.cache.max-entries:500}") int maxEntries) {
		return enabled ? new CachingSceneGenerator(delegate, maxEntries) : delegate;
	}
}
