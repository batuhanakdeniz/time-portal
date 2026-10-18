package com.timeportal.image;

/**
 * Görselin atıf bilgisi. {@code licenseUrl} bilinmiyorsa {@code null} olabilir. {@code provider}
 * kaynağı açıkça belirtir ({@link #MAPILLARY} ya da {@link #WIKIMEDIA_COMMONS}); kaynak
 * belirtmeyen eski dörtlü kurucuda {@code null}'dır.
 */
public record Attribution(String author, String license, String licenseUrl, String sourceUrl, String provider) {

	public static final String MAPILLARY = "mapillary";
	public static final String WIKIMEDIA_COMMONS = "wikimedia-commons";

	public Attribution(String author, String license, String licenseUrl, String sourceUrl) {
		this(author, license, licenseUrl, sourceUrl, null);
	}
}
