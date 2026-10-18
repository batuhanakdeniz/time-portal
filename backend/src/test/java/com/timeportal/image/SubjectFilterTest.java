package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;

import com.timeportal.geo.District;
import com.timeportal.geo.ProvinceCenters;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SubjectFilterTest {

	@Test
	void insectPhotoWithoutUrbanHintIsRejected() {
		// Adana/Aladağ'da gerçekten dönen türden bir örnek
		assertThat(SubjectFilter.isRelevant("File:Aladağ beetle on leaf.jpg", "Insects of Turkey|Coleoptera")).isFalse();
		assertThat(SubjectFilter.isRelevant("File:Zerynthia polyxena.jpg", "Butterflies of Turkey|Lepidoptera")).isFalse();
	}

	@Test
	void otherNonUrbanSubjectsAreRejected() {
		assertThat(SubjectFilter.isRelevant("File:Portrait of a man.jpg", "Portrait photographs")).isFalse();
		assertThat(SubjectFilter.isRelevant("File:Kuş.jpg", "Birds of Turkey")).isFalse();
		assertThat(SubjectFilter.isRelevant("File:Çiçek.jpg", "Flowers of Adana")).isFalse();
		assertThat(SubjectFilter.isRelevant("File:Yemek.jpg", "Food of Turkey")).isFalse();
	}

	@Test
	void urbanOrScenicHintsAreAccepted() {
		assertThat(SubjectFilter.isRelevant("File:Hükümet Konağı.jpg", "Government buildings in Turkey")).isTrue();
		assertThat(SubjectFilter.isRelevant("File:Adana view.jpg", "Views of Adana")).isTrue();
		assertThat(SubjectFilter.isRelevant("File:Ulu Camii.jpg", "Mosques in Adana")).isTrue();
		assertThat(SubjectFilter.isRelevant("File:Taşköprü.jpg", "Köprü")).isTrue();
		assertThat(SubjectFilter.isRelevant("File:Meydan 2019.jpg", "")).isTrue();
		assertThat(SubjectFilter.isRelevant("File:Kale manzarası.jpg", "")).isTrue();
		assertThat(SubjectFilter.isRelevant("File:X.jpg", "Harbours in Turkey|Skyline")).isTrue();
	}

	@Test
	void urbanHintWinsOverNonUrbanHint() {
		// Meydandaki kuşlar: kent ipucu var, kabul
		assertThat(SubjectFilter.isRelevant("File:Birds at the square.jpg", "Birds|Squares in Turkey")).isTrue();
	}

	@Test
	void imageWithNoHintsAtAllIsAccepted() {
		assertThat(SubjectFilter.isRelevant("File:IMG 1234.jpg", "")).isTrue();
		assertThat(SubjectFilter.isRelevant(null, null)).isTrue();
	}

	@Test
	void matchesWholeWordsOnlyAndIgnoresCase() {
		// "bird" kelimesi içinde geçen "birdge" gibi alt dizgi eşleşmez; "BEETLE" büyük harfle de elenir
		assertThat(SubjectFilter.isRelevant("File:BEETLE.jpg", "")).isFalse();
		assertThat(SubjectFilter.isRelevant("File:Subway.jpg", "")).isTrue();
	}

	private static final String COMMONS_JSON = """
			{"query":{"pages":{"1":{"title":"File:Aladağ böcek beetle.jpg","index":1,"imageinfo":[{
			"thumburl":"https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/B.jpg/2048px-B.jpg",
			"url":"https://upload.wikimedia.org/wikipedia/commons/a/aa/B.jpg",
			"descriptionurl":"https://commons.wikimedia.org/wiki/File:B.jpg","width":4000,"height":3000,"mime":"image/jpeg",
			"extmetadata":{"LicenseShortName":{"value":"CC BY 4.0"},"Artist":{"value":"A"},"Categories":{"value":"Insects of Turkey"}}}]},
			"2":{"title":"File:Adana meydan.jpg","index":2,"imageinfo":[{
			"thumburl":"https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/M.jpg/2048px-M.jpg",
			"url":"https://upload.wikimedia.org/wikipedia/commons/b/bb/M.jpg",
			"descriptionurl":"https://commons.wikimedia.org/wiki/File:M.jpg","width":4000,"height":3000,"mime":"image/jpeg",
			"extmetadata":{"LicenseShortName":{"value":"CC BY 4.0"},"Artist":{"value":"B"},"Categories":{"value":"Squares in Turkey"}}}]}}}}
			""";

	@Test
	void commonsSourceWithFilterSkipsInsectButPlainSourceKeepsIt() {
		FakeHttp http = new FakeHttp(u -> COMMONS_JSON);

		CityImage filtered = new WikimediaCommonsImageSource(http, true).find(37.0, 35.0, 1000).orElseThrow();
		CityImage plain = new WikimediaCommonsImageSource(http).find(37.0, 35.0, 1000).orElseThrow();

		assertThat(filtered.url()).contains("M.jpg");
		// Süzgeçsiz kaynakta geosearch sırasındaki ilk (index 1) aday seçilir: davranış değişmedi
		assertThat(plain.url()).contains("B.jpg");
	}

	@Test
	void commonsSourceWithFilterReturnsEmptyWhenOnlyIrrelevantCandidatesExist() {
		String onlyInsect = COMMONS_JSON.replace("Adana meydan", "Adana macro").replace("Squares in Turkey", "Plants of Turkey");
		FakeHttp http = new FakeHttp(u -> onlyInsect);

		assertThat(new WikimediaCommonsImageSource(http, true).find(37.0, 35.0, 1000)).isEmpty();
	}

	@Test
	void chainUsesTheFilteredSourceOnlyForTheProvinceCenterStep() {
		List<String> calls = new ArrayList<>();
		GeoImageSource districtCommons = source("district", calls, Optional.empty());
		CityImage img = new CityImage("https://x.example/p", ImageKind.PHOTO, 2048, 1024,
				new Attribution("a", "CC BY 4.0", null, "https://x.example/s"));
		GeoImageSource provinceCommons = source("province", calls, Optional.of(img));
		ProvinceCenters provinces = new ProvinceCenters();
		District beyoglu = new District("İstanbul", "Beyoğlu", 41.03194, 28.97611);

		Optional<CityImage> r = new ChainedCityImageFinder(source("mapillary", calls, Optional.empty()), districtCommons,
				provinceCommons, provinces, Clock.systemUTC(), Duration.ofSeconds(25)).find(beyoglu);

		assertThat(r).contains(img);
		assertThat(calls).containsExactly("district", "province");
	}

	private static GeoImageSource source(String name, List<String> calls, Optional<CityImage> result) {
		return new GeoImageSource() {
			@Override
			public boolean available() {
				return !name.equals("mapillary");
			}

			@Override
			public Optional<CityImage> find(double latitude, double longitude, double radiusMeters) {
				calls.add(name);
				return result;
			}
		};
	}
}
