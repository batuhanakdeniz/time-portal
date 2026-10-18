package com.timeportal.geo;

import java.util.Optional;

/** Koordinattan Türkiye ilçesini (ve ilini) bulur. Türkiye dışı ya da denizdeki nokta için boş döner. */
public interface DistrictLocator {

	Optional<District> locate(double latitude, double longitude);
}
