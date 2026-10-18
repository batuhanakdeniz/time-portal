package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;

import com.timeportal.geo.District;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class FakeSceneGeneratorTest {

	@Test
	void fillsKindPlaceAndSampleAttributionWhenLocationIsInADistrict() {
		FakeSceneGenerator fake = new FakeSceneGenerator(0, (lat, lon) -> Optional.of(new District("İstanbul", "Beyoğlu", 41, 29)));

		SceneResult r = fake.generate(new SceneRequest(2026, 41.0369, 28.985));

		assertThat(r.panoramaUrl()).isEqualTo("/api/samples/sample-pano.png");
		assertThat(r.depthUrl()).isEqualTo("/api/samples/sample-depth.png");
		assertThat(r.kind()).isEqualTo("panorama");
		assertThat(r.place()).isEqualTo(new SceneResult.Place("İstanbul", "Beyoğlu"));
		assertThat(r.attribution().provider()).isEqualTo("sample");
	}

	@Test
	void placeIsNullWhenLocationIsOutsideAnyDistrict() {
		FakeSceneGenerator fake = new FakeSceneGenerator(0, (lat, lon) -> Optional.empty());

		SceneResult r = fake.generate(new SceneRequest(2026, 0, 0));

		assertThat(r.place()).isNull();
		assertThat(r.kind()).isEqualTo("panorama");
		assertThat(r.attribution()).isNotNull();
	}
}
