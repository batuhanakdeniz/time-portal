package com.timeportal.artifact;

import java.awt.image.BufferedImage;

/** İndirilmiş ve çözülmüş görsel. {@code ext}: {@code jpg} ya da {@code png}. */
public record FetchedImage(byte[] bytes, String ext, BufferedImage image) {
}
