package com.timeportal.geo;

/**
 * Türkiye ilçesi. {@code centerLat}/{@code centerLon} ilçe merkezidir (Wikidata, yoksa poligonun iç
 * noktası); her zaman ilçe sınırı içinde kalır.
 */
public record District(String province, String name, double centerLat, double centerLon) {
}
