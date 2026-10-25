package com.timeportal.period;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * Bir dönem kovası (docs/FAZ3.md §2). Aralık {@code [yearFrom, yearTo)}: başlangıç dahil, bitiş hariç.
 * Negatif yıl MÖ'dür; yıl 0 yoktur. Kimlikler değişmez, frontend aynı tabloyu kullanır.
 */
public record PeriodBucket(String id, String name, int yearFrom, int yearTo, Confidence confidence) {

	/** Dönem görselinin güvenilirliği. JSON'da küçük harf: {@code gercek | yorum | kurgu}. */
	public enum Confidence {
		/** Bugünün gerçek görüntüsü. */
		GERCEK,
		/** Kaynaklara dayalı yorum (tarihsel dönemler). */
		YORUM,
		/** Kurgu (tarih öncesi ve gelecek): MVP'de sahne üretilmez. */
		KURGU;

		@JsonValue
		public String json() {
			return name().toLowerCase(Locale.ROOT);
		}
	}

	public PeriodBucket {
		if (yearFrom >= yearTo) {
			throw new IllegalArgumentException("yearFrom must be before yearTo");
		}
	}

	/** Yıl bu kovada mı? Yıl 0 hiçbir kovada değildir. */
	public boolean contains(int year) {
		return year != 0 && year >= yearFrom && year < yearTo;
	}

	/** Kurgu kova mı? Bu kovalarda sahne üretilmez ("no scene for period"). */
	public boolean isFictional() {
		return confidence == Confidence.KURGU;
	}
}
