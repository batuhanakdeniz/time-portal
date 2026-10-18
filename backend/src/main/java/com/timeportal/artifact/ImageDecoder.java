package com.timeportal.artifact;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/**
 * Baytların gerçekten çözülebilen bir JPEG ya da PNG olduğunu içerikten doğrular (başlığa
 * güvenmez). Piksel sayısı çözmeden önce sınırlanır (decompression bomb).
 */
public final class ImageDecoder {

	/** 24 megapiksel (~96 MB ham RGB). Mapillary (2048 px) ve Commons küçük resimleri (2048 px) bunun çok altındadır. */
	public static final long MAX_PIXELS = 24_000_000L;

	private ImageDecoder() {
	}

	public static FetchedImage decode(byte[] bytes) throws IOException {
		try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
			if (in == null) {
				throw new IOException("not an image");
			}
			Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
			if (!readers.hasNext()) {
				throw new IOException("not a decodable image");
			}
			ImageReader reader = readers.next();
			try {
				String format = reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
				String ext = switch (format) {
					case "jpeg", "jpg" -> "jpg";
					case "png" -> "png";
					default -> throw new IOException("unsupported image format");
				};
				reader.setInput(in, true, true);
				long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
				if (pixels <= 0 || pixels > MAX_PIXELS) {
					throw new IOException("image dimensions out of range");
				}
				BufferedImage image = reader.read(0);
				if (image == null) {
					throw new IOException("image could not be decoded");
				}
				return new FetchedImage(bytes, ext, image);
			}
			catch (RuntimeException e) {
				throw new IOException("image could not be decoded", e);
			}
			finally {
				reader.dispose();
			}
		}
	}
}
