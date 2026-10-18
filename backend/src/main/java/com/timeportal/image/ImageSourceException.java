package com.timeportal.image;

/** Bir görsel kaynağı başarısız oldu (zaman aşımı, 5xx, bozuk yanıt). Mesaj sır içermez. */
public class ImageSourceException extends RuntimeException {

	public ImageSourceException(String message) {
		super(message);
	}
}
