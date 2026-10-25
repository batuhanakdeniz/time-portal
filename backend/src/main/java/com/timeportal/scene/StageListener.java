package com.timeportal.scene;

/**
 * Üreticinin aşama bildirimleri. Üretici aşamaları {@link SceneStage} sırasıyla bildirir; önbellekten
 * dönen sonuçta aşamalar atlanabilir. Uygulamalar hızlı olmalı ve istisna fırlatmamalıdır.
 */
@FunctionalInterface
public interface StageListener {

	/** Hiçbir şey yapmayan dinleyici. */
	StageListener NONE = stage -> {
	};

	void onStage(SceneStage stage);
}
