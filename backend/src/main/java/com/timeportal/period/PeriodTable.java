package com.timeportal.period;

import com.timeportal.period.PeriodBucket.Confidence;
import java.util.List;

/**
 * 15 dönem kovası (karar 4A, docs/FAZ3.md §2). Kovalar boşluksuz ve örtüşmesiz olarak
 * {@code [-100000, 100001)} aralığını kaplar; yıl 0 geçersizdir. Saf ve durumsuzdur.
 */
public final class PeriodTable {

	public static final int MIN_YEAR = -100_000;
	/** Son kovanın (hariç) bitişi; 100000 son kovaya dahildir. */
	public static final int END_YEAR_EXCLUSIVE = 100_001;

	public static final List<PeriodBucket> BUCKETS = List.of(
			new PeriodBucket("paleolitik", "Paleolitik ve buzul çağı", -100000, -10000, Confidence.KURGU),
			new PeriodBucket("neolitik", "Neolitik–Kalkolitik", -10000, -3000, Confidence.KURGU),
			new PeriodBucket("tunc", "Tunç Çağı", -3000, -1200, Confidence.YORUM),
			new PeriodBucket("demir", "Demir Çağı", -1200, -550, Confidence.YORUM),
			new PeriodBucket("helenistik", "Pers–Helenistik", -550, -30, Confidence.YORUM),
			new PeriodBucket("roma", "Roma", -30, 395, Confidence.YORUM),
			new PeriodBucket("bizans", "Bizans", 395, 1071, Confidence.YORUM),
			new PeriodBucket("selcuklu", "Selçuklu–Beylikler", 1071, 1453, Confidence.YORUM),
			new PeriodBucket("osmanli-klasik", "Osmanlı klasik", 1453, 1700, Confidence.YORUM),
			new PeriodBucket("osmanli-gec", "Osmanlı geç", 1700, 1923, Confidence.YORUM),
			new PeriodBucket("erken-cumhuriyet", "Erken Cumhuriyet", 1923, 1960, Confidence.YORUM),
			new PeriodBucket("yirminci-yy-sonu", "20. yüzyıl sonu", 1960, 2000, Confidence.YORUM),
			new PeriodBucket("bugun", "Bugün", 2000, 2030, Confidence.GERCEK),
			new PeriodBucket("yakin-gelecek", "Yakın gelecek", 2030, 2200, Confidence.KURGU),
			new PeriodBucket("uzak-gelecek", "Uzak gelecek", 2200, END_YEAR_EXCLUSIVE, Confidence.KURGU));

	private PeriodTable() {
	}

	/**
	 * Yılın kovası. Başlangıç dahil, bitiş hariç (MÖ 1200 = {@code -1200} Demir Çağı'na girer).
	 *
	 * @throws IllegalArgumentException yıl 0 ya da {@code [-100000, 100000]} dışındaysa
	 */
	public static PeriodBucket bucketOf(int year) {
		if (year == 0 || year < MIN_YEAR || year >= END_YEAR_EXCLUSIVE) {
			throw new IllegalArgumentException(
					"year must be between %d and %d and not 0".formatted(MIN_YEAR, END_YEAR_EXCLUSIVE - 1));
		}
		// Kovalar artan sırada ve bitişik: bitişi yıldan büyük ilk kova.
		for (PeriodBucket bucket : BUCKETS) {
			if (year < bucket.yearTo()) {
				return bucket;
			}
		}
		throw new IllegalStateException("period table does not cover year " + year);
	}
}
