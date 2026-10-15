package com.timeportal.scene;

/**
 * Tarih ve konumdan sahne üreten servis. Harici AI servisleri bu arayüzün arkasındadır;
 * testler gerçek servisi çağırmaz.
 */
@FunctionalInterface
public interface SceneGenerator {

	SceneResult generate(SceneRequest request);
}
