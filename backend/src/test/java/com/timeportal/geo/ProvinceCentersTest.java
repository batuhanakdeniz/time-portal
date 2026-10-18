package com.timeportal.geo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class ProvinceCentersTest {

	private final ProvinceCenters centers = new ProvinceCenters();

	@Test
	void has81Provinces() {
		assertThat(centers.size()).isEqualTo(81);
	}

	@Test
	void everyProvinceOfTheDistrictDataHasACenterInsideTurkey() {
		Set<String> provinces = new PolygonDistrictLocator().districts().stream()
			.map(District::province)
			.collect(Collectors.toSet());

		assertThat(provinces).hasSize(81);
		for (String p : provinces) {
			District c = centers.centerOf(p).orElseThrow(() -> new AssertionError("no center for " + p));
			assertThat(c.centerLat()).as(p).isBetween(35.8, 42.2);
			assertThat(c.centerLon()).as(p).isBetween(25.6, 44.9);
		}
	}

	@Test
	void bigCitiesHaveSensibleCoordinates() {
		assertNear("Ankara", 39.93, 32.85);
		assertNear("İstanbul", 41.01, 28.98);
		assertNear("İzmir", 38.42, 27.13);
		assertNear("Antalya", 36.90, 30.70);
		assertNear("Hakkari", 37.57, 43.74);
	}

	@Test
	void unknownProvinceIsEmpty() {
		assertThat(centers.centerOf("Atlantis")).isEmpty();
	}

	private void assertNear(String province, double lat, double lon) {
		District c = centers.centerOf(province).orElseThrow();
		assertThat(c.centerLat()).as(province).isCloseTo(lat, org.assertj.core.data.Offset.offset(0.1));
		assertThat(c.centerLon()).as(province).isCloseTo(lon, org.assertj.core.data.Offset.offset(0.1));
	}
}
