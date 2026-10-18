package com.timeportal.scene;

/**
 * Üretilen sahnenin yapıtları. Adresler frontend'in doğrudan yükleyebileceği yollardır.
 *
 * <p>{@code panoramaUrl} her türde görselin adresidir (fotoğrafta da; ad tarihseldir). {@code kind}
 * {@code "panorama"} ya da {@code "photo"}. {@code place} ve {@code attribution} bilinmiyorsa
 * {@code null} olabilir.
 */
public record SceneResult(String panoramaUrl, String depthUrl, String kind, Place place, Attribution attribution) {

	public static final String KIND_PANORAMA = "panorama";
	public static final String KIND_PHOTO = "photo";

	/** Konumun ait olduğu il ve ilçe. */
	public record Place(String province, String district) {
	}

	/** Görselin atfı. {@code provider}: mapillary | wikimedia-commons | sample. {@code licenseUrl} boş olabilir. */
	public record Attribution(String author, String license, String licenseUrl, String sourceUrl, String provider) {
	}

	/** Eski iki alanlı biçim; yeni alanlar {@code null}. */
	public SceneResult(String panoramaUrl, String depthUrl) {
		this(panoramaUrl, depthUrl, null, null, null);
	}
}
