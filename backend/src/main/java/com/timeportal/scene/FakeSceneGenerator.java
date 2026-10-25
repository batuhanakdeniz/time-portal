package com.timeportal.scene;

import com.timeportal.geo.District;
import com.timeportal.geo.DistrictLocator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Geliştirme ve CI için: her istek için aynı örnek panorama ve derinlik haritasını döner.
 * {@code timeportal.generator=fake} ile seçilir. Yer, konum bir ilçeye düşüyorsa doldurulur; dönem
 * istekteki yıldan doldurulur. Aşamaları ({@link SceneStage}) sırayla bildirir; gecikme verilmişse
 * aşamalara eşit bölünür (frontend yükleme ekranı geliştirmede aşamaları görebilsin diye).
 */
@Component
@ConditionalOnProperty(name = "timeportal.generator", havingValue = "fake")
public class FakeSceneGenerator implements SceneGenerator {

	static final String PANORAMA_URL = "/api/samples/sample-pano.png";
	static final String DEPTH_URL = "/api/samples/sample-depth.png";
	static final String SAMPLE_PROVIDER = "sample";

	private final long delayMillis;
	private final DistrictLocator districts;

	public FakeSceneGenerator(@Value("${timeportal.fake-generator.delay-ms:0}") long delayMillis,
			DistrictLocator districts) {
		this.delayMillis = delayMillis;
		this.districts = districts;
	}

	@Override
	public SceneResult generate(SceneRequest request) {
		return generate(request, StageListener.NONE);
	}

	@Override
	public SceneResult generate(SceneRequest request, StageListener listener) {
		SceneStage[] stages = SceneStage.values();
		for (int i = 0; i < stages.length; i++) {
			listener.onStage(stages[i]);
			pause(delayMillis / stages.length + (i == stages.length - 1 ? delayMillis % stages.length : 0));
		}
		SceneResult.Place place = districts.locate(request.latitude(), request.longitude())
			.map(FakeSceneGenerator::toPlace)
			.orElse(null);
		return new SceneResult(PANORAMA_URL, DEPTH_URL, SceneResult.KIND_PANORAMA, place,
				new SceneResult.Attribution("time-portal", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/",
						"https://github.com/batuhanakdeniz/time-portal", SAMPLE_PROVIDER),
				ScenePeriod.ofYear(request.year()));
	}

	private static void pause(long millis) {
		if (millis <= 0) {
			return;
		}
		try {
			Thread.sleep(millis);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("generation interrupted", e);
		}
	}

	private static SceneResult.Place toPlace(District d) {
		return new SceneResult.Place(d.province(), d.name());
	}
}
