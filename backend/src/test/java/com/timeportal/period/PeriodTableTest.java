package com.timeportal.period;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.timeportal.period.PeriodBucket.Confidence;
import com.timeportal.scene.SceneRequest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class PeriodTableTest {

	/** docs/FAZ3.md §2 ile birebir. */
	@Test
	void tableMatchesTheContract() {
		assertThat(PeriodTable.BUCKETS).containsExactly(
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
				new PeriodBucket("uzak-gelecek", "Uzak gelecek", 2200, 100001, Confidence.KURGU));
	}

	@Test
	void bucketsAreContiguousWithoutGapsOrOverlapsAndCoverTheWholeRange() {
		List<PeriodBucket> b = PeriodTable.BUCKETS;
		assertThat(b.getFirst().yearFrom()).isEqualTo(-100000);
		assertThat(b.getLast().yearTo()).isEqualTo(100001);
		for (int i = 0; i < b.size(); i++) {
			assertThat(b.get(i).yearFrom()).isLessThan(b.get(i).yearTo());
			if (i > 0) {
				assertThat(b.get(i).yearFrom()).isEqualTo(b.get(i - 1).yearTo());
			}
		}
		assertThat(b.stream().map(PeriodBucket::id).distinct()).hasSize(15);
	}

	@ParameterizedTest
	@CsvSource({
			"-100000, paleolitik",
			"-10001, paleolitik",
			"-10000, neolitik",
			"-3001, neolitik",
			"-3000, tunc",
			"-1201, tunc",
			"-1200, demir",
			"-550, helenistik",
			"-44, helenistik",
			"-30, roma",
			"-1, roma",
			"1, roma",
			"394, roma",
			"395, bizans",
			"1070, bizans",
			"1071, selcuklu",
			"1452, selcuklu",
			"1453, osmanli-klasik",
			"1699, osmanli-klasik",
			"1700, osmanli-gec",
			"1922, osmanli-gec",
			"1923, erken-cumhuriyet",
			"1960, yirminci-yy-sonu",
			"1999, yirminci-yy-sonu",
			"2000, bugun",
			"2026, bugun",
			"2029, bugun",
			"2030, yakin-gelecek",
			"2199, yakin-gelecek",
			"2200, uzak-gelecek",
			"100000, uzak-gelecek",
	})
	void bucketOfUsesInclusiveStartAndExclusiveEnd(int year, String id) {
		assertThat(PeriodTable.bucketOf(year).id()).isEqualTo(id);
	}

	@Test
	void everyYearInTheRangeExceptZeroHasExactlyOneBucket() {
		for (int year = -100000; year <= 100000; year++) {
			if (year == 0) {
				continue;
			}
			int y = year;
			assertThat(PeriodTable.BUCKETS.stream().filter(p -> p.contains(y))).as("year %d", y).hasSize(1);
			assertThat(PeriodTable.bucketOf(y).contains(y)).isTrue();
		}
	}

	@ParameterizedTest
	@ValueSource(ints = {0, -100001, 100001, Integer.MIN_VALUE, Integer.MAX_VALUE})
	void yearZeroAndYearsOutsideTheRangeAreRejected(int year) {
		assertThatThrownBy(() -> PeriodTable.bucketOf(year)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void fictionalBucketsAreTheFirstTwoAndTheLastTwo() {
		assertThat(PeriodTable.BUCKETS.stream().filter(PeriodBucket::isFictional).map(PeriodBucket::id))
			.containsExactly("paleolitik", "neolitik", "yakin-gelecek", "uzak-gelecek");
	}

	@Test
	void confidenceIsLowercaseInJson() {
		assertThat(Confidence.GERCEK.json()).isEqualTo("gercek");
		assertThat(Confidence.YORUM.json()).isEqualTo("yorum");
		assertThat(Confidence.KURGU.json()).isEqualTo("kurgu");
	}

	/** İstek doğrulaması ile tablo aynı aralığı kapsamalı; yoksa geçerli istek dönem kontrolünde fırlatır. */
	@Test
	void tableRangeMatchesTheSceneRequestYearRange() {
		assertThat(PeriodTable.MIN_YEAR).isEqualTo(SceneRequest.MIN_YEAR);
		assertThat(PeriodTable.END_YEAR_EXCLUSIVE - 1).isEqualTo(SceneRequest.MAX_YEAR);
		assertThat(PeriodTable.BUCKETS.getFirst().yearFrom()).isEqualTo(SceneRequest.MIN_YEAR);
		assertThat(PeriodTable.BUCKETS.getLast().yearTo() - 1).isEqualTo(SceneRequest.MAX_YEAR);
		assertThat(PeriodTable.bucketOf(new SceneRequest(SceneRequest.MIN_YEAR, 0, 0).year())).isNotNull();
		assertThat(PeriodTable.bucketOf(new SceneRequest(SceneRequest.MAX_YEAR, 0, 0).year())).isNotNull();
	}
}
