package com.timeportal.image;

import java.util.Optional;

/**
 * Arama sonucu. {@code degraded}: zincirde bir kaynak hata verdi ya da süre bütçesi doldu; yani sonuç
 * (dolu ya da boş) kesin değildir ve önbellekte kısa süre tutulmalıdır.
 */
public record FindOutcome(Optional<CityImage> image, boolean degraded) {
}
