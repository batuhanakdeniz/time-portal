package com.timeportal.scene;

import com.timeportal.image.CityImageFinder;

/**
 * Konum için hiçbir adımda görsel bulunamadı. İş bu mesajla FAILED olur ve mesaj istemciye gider
 * (diğer hatalar genel "generation failed" olarak döner).
 */
public class NoImageFoundException extends RuntimeException {

	public NoImageFoundException() {
		super(CityImageFinder.NO_IMAGE_MESSAGE);
	}
}
