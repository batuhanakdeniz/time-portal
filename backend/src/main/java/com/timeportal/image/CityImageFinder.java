package com.timeportal.image;

import com.timeportal.geo.District;
import java.util.Optional;

/** İlçe merkezine ait açık lisanslı bir görsel bulur. */
public interface CityImageFinder {

	/** Hiçbir adımda görsel bulunamazsa iş (#41) bu mesajla FAILED olmalıdır. */
	String NO_IMAGE_MESSAGE = "no image found for location";

	/** Görsel yoksa boş döner; kaynak hataları fırlatılmaz (zincir sonraki adıma geçer). */
	Optional<CityImage> find(District district);
}
