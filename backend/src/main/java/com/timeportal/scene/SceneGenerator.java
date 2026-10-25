package com.timeportal.scene;

/**
 * Tarih ve konumdan sahne üreten servis. Harici AI servisleri bu arayüzün arkasındadır;
 * testler gerçek servisi çağırmaz.
 */
@FunctionalInterface
public interface SceneGenerator {

	SceneResult generate(SceneRequest request);

	/**
	 * Aşama bildirimli üretim. Üretici aşamaları {@link SceneStage} sırasıyla {@code listener}'a
	 * bildirir; önbellekten dönen sonuçta aşamalar atlanabilir. Varsayılan: aşama bildirmez
	 * (geriye uyumlu).
	 */
	default SceneResult generate(SceneRequest request, StageListener listener) {
		return generate(request);
	}
}
