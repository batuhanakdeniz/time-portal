package com.timeportal.depth;

import java.awt.image.BufferedImage;

/**
 * Tek görselden göreli ters derinlik tahmini. Dönen harita girdiyle aynı boyuttadır; büyük değer
 * yakındır. Gerçek model bu arayüzün arkasındadır, testler sahte uygulama kullanır.
 */
public interface DepthEstimator {

	DepthMap estimate(BufferedImage image);
}
