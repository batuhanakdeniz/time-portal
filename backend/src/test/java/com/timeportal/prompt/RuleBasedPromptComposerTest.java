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
			"55, temperate",
			"55.1, subarctic",
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
		assertThat(compose(2026, 0, 0).setting()).contains("equatorial hemisphere");
	}

	@Test
	void polesAndAntimeridian() {
		assertThat(compose(2026, 90, 180).text()).contains("polar");
		assertThat(compose(2026, -90, -180).setting()).contains("polar").contains("Antarctica");
		assertThat(compose(2026, 0, 180).text()).isNotBlank();
		assertThat(compose(2026, 0, -180).text()).isNotBlank();
	}

	@Test
	void roughRegions() {
		assertThat(compose(-44, 41.9, 12.5).setting()).contains("Europe");
		assertThat(compose(2026, 41.0, 29.0).setting()).contains("Europe");
		assertThat(compose(3500, 64.1, -21.9).setting()).contains("Europe");
		assertThat(compose(2026, 30.0, 31.0).setting()).contains("Africa");
		assertThat(compose(2026, 35.7, 139.7).setting()).contains("Asia");
		assertThat(compose(2026, 40.7, -74.0).setting()).contains("North America");
		assertThat(compose(2026, -23.5, -46.6).setting()).contains("South America");
		assertThat(compose(2026, -33.9, 151.2).setting()).contains("Oceania");
	}

	@Test
	void unknownRegionIsNotInvented() {
		ScenePrompt prompt = compose(2026, 0, -150); // açık Pasifik
		assertThat(prompt.setting()).isEqualTo("tropical climate, equatorial hemisphere");
		assertThat(prompt.text()).doesNotContain("unknown");
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
