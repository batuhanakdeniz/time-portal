package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class SceneRequestTest {

	@Test
	void acceptsBcAndFutureYears() {
		assertThat(new SceneRequest(-44, 41.9, 12.5).year()).isEqualTo(-44);
		assertThat(new SceneRequest(2150, -33.9, 151.2).year()).isEqualTo(2150);
	}

	@Test
	void rejectsYearZero() {
		assertThatThrownBy(() -> new SceneRequest(0, 0, 0))
				.isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("year");
	}

	@Test
	void rejectsYearOutOfRange() {
		assertThatThrownBy(() -> new SceneRequest(100_001, 0, 0)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new SceneRequest(-100_001, 0, 0)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void rejectsCoordinatesOutOfRange() {
		assertThatThrownBy(() -> new SceneRequest(2000, 90.1, 0)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new SceneRequest(2000, -90.1, 0)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new SceneRequest(2000, 0, 180.1)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new SceneRequest(2000, 0, -180.1)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void acceptsCoordinateBoundaries() {
		assertThat(new SceneRequest(2000, 90, 180)).isNotNull();
		assertThat(new SceneRequest(2000, -90, -180)).isNotNull();
	}

	@Test
	void rejectsNonFiniteCoordinates() {
		assertThatThrownBy(() -> new SceneRequest(2000, Double.NaN, 0)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new SceneRequest(2000, 0, Double.POSITIVE_INFINITY)).isInstanceOf(IllegalArgumentException.class);
	}
}
