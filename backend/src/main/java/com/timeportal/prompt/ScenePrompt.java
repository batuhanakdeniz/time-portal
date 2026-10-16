package com.timeportal.prompt;

/**
 * Görsel modeline verilecek sahne tarifi.
 *
 * @param text    360° equirectangular panorama için İngilizce sahne tarifi
 * @param era     dönem adı (ör. "Medieval era")
 * @param setting iklim/bölge özeti (ör. "temperate climate, northern hemisphere, Europe")
 */
public record ScenePrompt(String text, String era, String setting) {
}
