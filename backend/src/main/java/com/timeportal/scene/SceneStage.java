package com.timeportal.scene;

/**
 * Çalışan işin aşaması ({@code stage}, docs/FAZ3.md §3). Sıra bu: konum → görsel arama ve indirme →
 * derinlik → paketleme. Yalnızca {@link SceneStatus#RUNNING} iken anlamlıdır.
 */
public enum SceneStage {
	LOCATING,
	IMAGE_SEARCH,
	DEPTH,
	PACKAGING
}
