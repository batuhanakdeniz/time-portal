package com.timeportal.scene;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Gerçek servis seçilene kadar her istek için aynı örnek panorama ve derinlik haritasını döner. */
@Component
public class FakeSceneGenerator implements SceneGenerator {

	static final String PANORAMA_URL = "/api/samples/sample-pano.png";
	static final String DEPTH_URL = "/api/samples/sample-depth.png";

	private final long delayMillis;

	public FakeSceneGenerator(@Value("${timeportal.fake-generator.delay-ms:0}") long delayMillis) {
		this.delayMillis = delayMillis;
	}

	@Override
	public SceneResult generate(SceneRequest request) {
		if (delayMillis > 0) {
			try {
				Thread.sleep(delayMillis);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				throw new IllegalStateException("generation interrupted", e);
			}
		}
		return new SceneResult(PANORAMA_URL, DEPTH_URL);
	}
}
