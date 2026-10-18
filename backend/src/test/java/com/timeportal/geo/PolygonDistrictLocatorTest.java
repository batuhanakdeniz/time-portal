package com.timeportal.geo;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.StringReader;
import java.util.Optional;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class PolygonDistrictLocatorTest {

	private static PolygonDistrictLocator locator;

	@BeforeAll
	static void load() {
		locator = PolygonDistrictLocator.fromClasspath();
	}

	private static void assertAt(double lat, double lon, String province, String district) {
		Optional<District> d = locator.locate(lat, lon);
		assertThat(d).as("(%s, %s)", lat, lon).isPresent();
		assertThat(d.get().province()).isEqualTo(province);
		assertThat(d.get().name()).isEqualTo(district);
	}

	@Test
	void kizilayIsCankaya() {
		assertAt(39.9208, 32.8541, "Ankara", "Çankaya");
	}

	@Test
	void taksimIsBeyoglu() {
		assertAt(41.0370, 28.9850, "İstanbul", "Beyoğlu");
	}

	@Test
	void kadikoyPierIsKadikoy() {
		assertAt(40.9915, 29.0245, "İstanbul", "Kadıköy");
	}

	@Test
	void konakIsKonak() {
		assertAt(38.4189, 27.1287, "İzmir", "Konak");
	}

	@Test
	void hakkariCenterIsMerkez() {
		assertAt(37.5744, 43.7408, "Hakkari", "Merkez");
	}

	@Test
	void bozcaadaIsItsOwnDistrictOnTheIsland() {
		assertAt(39.8372, 26.0719, "Çanakkale", "Bozcaada");
	}

	@Test
	void pointNearBorderResolvesToOneOfTheTwoNeighbours() {
		// Kadıköy–Üsküdar sınırının iki yanı (Altunizade–Acıbadem çevresi, yaklaşık 150 m arayla)
		Optional<District> a = locator.locate(41.0000, 29.0300);
		Optional<District> b = locator.locate(41.0000, 29.0330);
		assertThat(a).isPresent();
		assertThat(b).isPresent();
		assertThat(a.get().province()).isEqualTo("İstanbul");
		assertThat(b.get().province()).isEqualTo("İstanbul");
		assertThat(a.get().name()).isIn("Üsküdar", "Kadıköy", "Ataşehir");
		assertThat(b.get().name()).isIn("Üsküdar", "Kadıköy", "Ataşehir");
	}

	@Test
	void aegeanSeaIsOutside() {
		assertThat(locator.locate(38.5, 25.0)).isEmpty();
	}

	@Test
	void athensIsOutside() {
		assertThat(locator.locate(37.9838, 23.7275)).isEmpty();
	}

	@Test
	void batumiIsOutside() {
		assertThat(locator.locate(41.6168, 41.6367)).isEmpty();
	}

	@Test
	void districtCentersLieInsideTheirOwnDistrict() {
		assertThat(locator.districts()).hasSizeGreaterThan(900);
		for (District d : locator.districts()) {
			Optional<District> found = locator.locate(d.latitude(), d.longitude());
			assertThat(found).as(d.toString()).isPresent();
			assertThat(found.get().province()).as(d.toString()).isEqualTo(d.province());
		}
	}

	@Test
	void turkishNamesKeepTheirCharacters() {
		assertThat(locator.districts()).extracting(District::name).contains("Çankaya", "Beyoğlu", "Şişli", "Ödemiş");
		assertThat(locator.districts()).extracting(District::province).contains("İstanbul", "Şanlıurfa", "Ağrı");
	}

	@Test
	void parsesSmallCustomData() {
		String data = """
				# yorum
				D\tA\tİl\t1.00000\t1.00000\tW
				P
				O 0 0 2 0 2 2 0 2
				H 0.5 0.5 1.5 0.5 1.5 1.5 0.5 1.5
				""";
		PolygonDistrictLocator custom = new PolygonDistrictLocator(new StringReader(data));
		assertThat(custom.locate(0.2, 0.2)).map(District::name).contains("A");
		assertThat(custom.locate(1.0, 1.0)).isEmpty();
		assertThat(custom.locate(5, 5)).isEmpty();
	}

	@Test
	void loadsQuickly() {
		long t = System.nanoTime();
		PolygonDistrictLocator.fromClasspath();
		assertThat((System.nanoTime() - t) / 1_000_000).isLessThan(2000);
	}
}
