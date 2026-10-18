package com.timeportal.image;

/**
 * Görselin atıf bilgisi. {@code licenseUrl} bilinmiyorsa {@code null} olabilir; diğer alanlar doludur.
 */
public record Attribution(String author, String license, String licenseUrl, String sourceUrl) {
}
