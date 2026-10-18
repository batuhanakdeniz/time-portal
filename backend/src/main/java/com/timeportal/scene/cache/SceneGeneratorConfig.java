package com.timeportal.scene.cache;

import com.timeportal.scene.CityImageSceneGenerator;
import com.timeportal.scene.FakeSceneGenerator;
import com.timeportal.scene.SceneGenerator;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * Enjekte edilen {@link SceneGenerator}'ı belirler. Üretici {@code timeportal.generator} ile seçilir
 * ({@code city-image}: gerçek, varsayılan; {@code fake}: örnek yapıtlar). {@code fake} önbellekli
 * sarmalayıcıyla sarılır ({@code timeportal.cache.enabled=false} ise doğrudan). {@code city-image} dış önbellekle
 * sarılmaz: kendi ilçe başına önbelleği vardır.
 */
@Configuration
public class SceneGeneratorConfig {

	@Bean
	@Primary
	SceneGenerator primarySceneGenerator(ObjectProvider<FakeSceneGenerator> fake,
			ObjectProvider<CityImageSceneGenerator> real,
			@Value("${timeportal.generator:city-image}") String choice,
			@Value("${timeportal.cache.enabled:true}") boolean enabled,
			@Value("${timeportal.cache.max-entries:500}") int maxEntries) {
		return switch (choice) {
			case "fake" -> enabled ? new CachingSceneGenerator(fake.getObject(), maxEntries) : fake.getObject();
			// Gerçek üretici kendi ilçe önbelleğine sahip (TTL, yapıt varlığı, ilçe doğruluğu); dış
			// hücre+yıl önbelleği onu devre dışı bırakır ve sınırda yanlış ilçeyi paylaştırır.
			case "city-image" -> real.getObject();
			default -> throw new IllegalStateException("timeportal.generator must be 'city-image' or 'fake'");
		};
	}
}
