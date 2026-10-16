package com.timeportal.prompt;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.timeportal.scene.SceneRequest;

class RuleBasedPromptComposerTest {

	private final RuleBasedPromptComposer composer = new RuleBasedPromptComposer();

	private ScenePrompt compose(int year, double lat, double lon) {
		return composer.compose(new SceneRequest(year, lat, lon));
	}

	@ParameterizedTest
	@CsvSource({
			"-100000, Ice Age hunter-gatherer era",
			"-10001, Ice Age hunter-gatherer era",
			"-10000, Neolithic era",
			"-3001, Neolithic era",
			"-3000, Bronze and early Iron Age",
			"-501, Bronze and early Iron Age",
			"-500, Classical antiquity",
			"-44, Classical antiquity",
			"-1, Classical antiquity",
			"1, Classical antiquity",
			"499, Classical antiquity",
			"500, Medieval era",
			"1499, Medieval era",
			"1500, Early modern era",
			"1749, Early modern era",
			"1750, Industrial era",
			"1899, Industrial era",
			"1900, Modern era",
			"2026, Modern era",
			"2030, Modern era",
			"2031, Near future",
			"2200, Near future",
			"2201, Far future",
			"10000, Far future",
			"10001, Very distant future",
			"100000, Very distant future"
	})
	void eraBoundaries(int year, String era) {
		assertThat(compose(year, 10, 10).era()).isEqualTo(era);
	}

	@ParameterizedTest
	@CsvSource({
			"0, tropical",
			"23.5, tropical",
			"23.6, subtropical",
			"35, subtropical",
			"35.1, temperate",
			"55.7, temperate",
			"60, temperate",
			"60.1, subarctic",
			"66.5, subarctic",
			"66.6, polar",
			"90, polar",
			"-90, polar",
			"-30, subtropical"
	})
	void climateBands(double lat, String zone) {
		assertThat(compose(2026, lat, 0).setting()).startsWith(zone + " climate");
	}

	@Test
	void hemispheres() {
		assertThat(compose(2026, 10, 0).setting()).contains("northern hemisphere");
		assertThat(compose(2026, -10, 0).setting()).contains("southern hemisphere");
		ScenePrompt equator = compose(2026, 0, 0);
		assertThat(equator.setting()).isEqualTo("tropical climate, on the equator");
		assertThat(equator.text()).doesNotContain("equatorial hemisphere");
		assertThat(compose(2026, -0.0, 0).setting()).isEqualTo(equator.setting());
	}

	@Test
	void polesAndAntimeridian() {
		assertThat(compose(2026, 90, 180).setting()).isEqualTo("polar climate, northern hemisphere");
		assertThat(compose(2026, -90, -180).setting()).isEqualTo("polar climate, southern hemisphere");
		// Boylam ±180 aynı meridyendir; çıktı aynı iklim/dönem bilgisini vermeli.
		ScenePrompt east = compose(2026, 10, 180);
		ScenePrompt west = compose(2026, 10, -180);
		assertThat(east.setting()).isEqualTo(west.setting()).isEqualTo("tropical climate, northern hemisphere");
		assertThat(east.era()).isEqualTo(west.era());
	}

	private static final String[] CONTINENTS = {
			"Europe", "Asia", "Africa", "North America", "South America", "Oceania", "Antarctica", "unknown"};

	@Test
	void neverNamesAContinent() {
		double[][] places = {
				{36.8, 10.2}, {36.7, 3.1}, {39.9, 32.9}, {36.9, 30.7}, {40.99, 29.03}, {36.2, 37.1},
				{55.8, 49.1}, {48.7, 44.5}, {13.5, 144.8}, {7.5, 134.6}, {15.3, 38.9}, {10.5, -66.9},
				{10.4, -75.5}, {-7.3, 112.7}, {-8.4, 115.2}, {29.5, 34.0}, {21.3, -157.9}, {66.1, -169.8},
				{41.9, 12.5}, {41.0, 29.0}, {64.1, -21.9}, {-90, 0}, {0, -150}};
		for (double[] p : places) {
			for (int year : new int[] {-100000, -44, 1200, 2026, 3500}) {
				ScenePrompt prompt = compose(year, p[0], p[1]);
				for (String name : CONTINENTS) {
					assertThat(prompt.text()).doesNotContain(name);
					assertThat(prompt.setting()).doesNotContain(name);
				}
			}
		}
	}

	@Test
	void regionComesOnlyFromGeoContext() {
		RuleBasedPromptComposer withRegion = new RuleBasedPromptComposer((lat, lon) -> java.util.Optional.of("Testland"));
		ScenePrompt prompt = withRegion.compose(new SceneRequest(2026, 41.0, 29.0));
		assertThat(prompt.setting()).isEqualTo("temperate climate, northern hemisphere, Testland");
		assertThat(prompt.text()).contains("Testland");
	}

	@Test
	void polarAndIceAgeHaveNoHumanTraces() {
		String[] banned = {"settlement", "village", "town", "hut", "camp", "fire", "building", "house",
				"structure", "architecture", "road", "farm", "vehicle", "ruins"};
		for (int year : new int[] {-100000, -10001, -44, 1200, 2026, 3500, 20000}) {
			assertThat(compose(year, -80, 10).text().toLowerCase()).doesNotContain(banned);
			assertThat(compose(year, 80, 10).text().toLowerCase()).doesNotContain(banned);
		}
		for (double lat : new double[] {-45, 0, 30, 50, 62}) {
			assertThat(compose(-50000, lat, 20).text().toLowerCase()).doesNotContain(banned);
			assertThat(compose(-10001, lat, -150).text().toLowerCase()).doesNotContain(banned);
		}
	}

	@Test
	void noAnachronismsBeforeModernEra() {
		String[] modern = {"power lines", "solar", "electric", "turbine", "contemporary", "paved roads", "futuristic",
				"chimney", "railway", "steam"};
		for (int year : new int[] {-100000, -3001, -500, -44, -1, 1, 499, 1200, 1749}) {
			for (double lat : new double[] {-60, 0, 41.9, 64.1}) {
				assertThat(compose(year, lat, 12.5).text().toLowerCase()).doesNotContain(modern);
			}
		}
	}

	@Test
	void settlementsAreHedgedForUnknownTerrain() {
		assertThat(compose(1200, 0, -150).text()).contains("where terrain allows");
	}

	@Test
	void timeOfDayIsWellDistributedOverIntegerGrid() {
		java.util.Map<String, Integer> counts = new java.util.HashMap<>();
		int total = 0;
		for (int lat = -90; lat <= 90; lat += 10) {
			for (int lon = -180; lon <= 180; lon += 10) {
				String text = compose(2026, lat, lon).text();
				String lighting = text.substring(text.indexOf("Lighting: "), text.indexOf(". Photorealistic"));
				counts.merge(lighting, 1, Integer::sum);
				total++;
			}
		}
		assertThat(counts).hasSize(4);
		for (int c : counts.values()) {
			assertThat(c).isGreaterThan(total / 10);
		}
	}

	@Test
	void deterministic() {
		assertThat(compose(-44, 41.9, 12.5)).isEqualTo(compose(-44, 41.9, 12.5));
		assertThat(compose(3500, 64.1, -21.9)).isEqualTo(compose(3500, 64.1, -21.9));
	}

	@Test
	void textIsNonBlankAndReasonablyShort() {
		int[] years = {-100000, -44, -1, 1, 1066, 2026, 3500, 100000};
		double[] lats = {-90, -45, 0, 45, 90};
		double[] lons = {-180, 0, 180};
		for (int y : years) {
			for (double lat : lats) {
				for (double lon : lons) {
					ScenePrompt p = compose(y, lat, lon);
					assertThat(p.text()).isNotBlank().hasSizeLessThan(600).contains("equirectangular");
					assertThat(p.era()).isNotBlank();
					assertThat(p.setting()).isNotBlank();
				}
			}
		}
	}
}
