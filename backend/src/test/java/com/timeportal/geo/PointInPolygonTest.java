package com.timeportal.geo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class PointInPolygonTest {

	/** Köşeleri (x=boylam, y=enlem) düz dizi: x0,y0,x1,y1,... */
	private static double[] square(double x0, double y0, double x1, double y1) {
		return new double[] {x0, y0, x1, y0, x1, y1, x0, y1};
	}

	@Test
	void insideAndOutsideSimplePolygon() {
		Polygon p = new Polygon(square(0, 0, 10, 10), List.of());
		assertThat(p.contains(5, 5)).isTrue();
		assertThat(p.contains(11, 5)).isFalse();
		assertThat(p.contains(5, -0.1)).isFalse();
	}

	@Test
	void concavePolygonNotchIsOutside() {
		// "U" biçimi: ortadaki girinti dışarıda
		double[] u = {0, 0, 10, 0, 10, 10, 7, 10, 7, 4, 3, 4, 3, 10, 0, 10};
		Polygon p = new Polygon(u, List.of());
		assertThat(p.contains(1, 8)).isTrue();
		assertThat(p.contains(9, 8)).isTrue();
		assertThat(p.contains(5, 8)).isFalse();
		assertThat(p.contains(5, 2)).isTrue();
	}

	@Test
	void holeIsExcluded() {
		Polygon p = new Polygon(square(0, 0, 10, 10), List.of(square(4, 4, 6, 6)));
		assertThat(p.contains(5, 5)).isFalse();
		assertThat(p.contains(2, 2)).isTrue();
		assertThat(p.contains(4.5, 5.5)).isFalse();
	}

	@Test
	void multiPolygonMatchesAnyPart() {
		Polygon a = new Polygon(square(0, 0, 1, 1), List.of());
		Polygon b = new Polygon(square(10, 10, 11, 11), List.of(square(10.4, 10.4, 10.6, 10.6)));
		List<Polygon> multi = List.of(a, b);
		assertThat(PointInPolygon.containsAny(multi, 0.5, 0.5)).isTrue();
		assertThat(PointInPolygon.containsAny(multi, 10.1, 10.1)).isTrue();
		assertThat(PointInPolygon.containsAny(multi, 10.5, 10.5)).isFalse();
		assertThat(PointInPolygon.containsAny(multi, 5, 5)).isFalse();
	}

	@Test
	void distanceToBoundaryIsZeroOnEdgeAndPositiveOutside() {
		Polygon p = new Polygon(square(0, 0, 10, 10), List.of());
		assertThat(p.distanceToBoundary(10, 5)).isZero();
		assertThat(p.distanceToBoundary(11, 5)).isEqualTo(1.0);
		assertThat(p.distanceToBoundary(13, 14)).isEqualTo(5.0);
	}

	@Test
	void polygonCopiesItsInputArrays() {
		double[] ring = square(0, 0, 10, 10);
		Polygon p = new Polygon(ring, List.of());
		ring[0] = 100;
		assertThat(p.contains(1, 1)).isTrue();
	}
}
