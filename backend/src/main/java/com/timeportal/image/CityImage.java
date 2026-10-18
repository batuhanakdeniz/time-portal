package com.timeportal.image;

/**
 * Bulunan görsel. {@code url} doğrudan indirilebilir görsel adresidir (Mapillary için imzalı ve
 * süreli olabilir, bkz. {@link CachingCityImageFinder}). {@code width}/{@code height} {@code url}'deki
 * görselin piksel boyutudur.
 */
public record CityImage(String url, ImageKind kind, int width, int height, Attribution attribution) {
}
