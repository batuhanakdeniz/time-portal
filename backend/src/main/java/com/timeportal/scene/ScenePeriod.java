package com.timeportal.scene;

import com.timeportal.period.PeriodBucket;
import com.timeportal.period.PeriodTable;

/**
 * Sonuçtaki dönem bilgisi ({@code result.period}, docs/FAZ3.md §3). {@code confidence} JSON'da küçük
 * harf: {@code gercek | yorum | kurgu}.
 */
public record ScenePeriod(String id, String name, int yearFrom, int yearTo, PeriodBucket.Confidence confidence) {

	public static ScenePeriod of(PeriodBucket bucket) {
		return new ScenePeriod(bucket.id(), bucket.name(), bucket.yearFrom(), bucket.yearTo(), bucket.confidence());
	}

	/** İstekteki yılın dönemi. */
	public static ScenePeriod ofYear(int year) {
		return of(PeriodTable.bucketOf(year));
	}
}
