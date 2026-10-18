package com.timeportal.geo;

/**
 * Türkiye ilçesi. {@code latitude}/{@code longitude} ilçe merkezidir (Wikidata, yoksa poligonun iç
 * noktası); her zaman ilçe sınırı içinde kalır.
 */
public record District(String name, String province, double latitude, double longitude) {
}
