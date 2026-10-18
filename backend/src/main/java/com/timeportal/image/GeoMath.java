package com.timeportal.image;

import java.util.ArrayList;
import java.util.List;

final class GeoMath {

	private static final double EARTH_RADIUS_M = 6_371_000;
	private static final double METERS_PER_DEGREE_LAT = 111_320;

	private GeoMath() {
	}

	static double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
		double dLat = Math.toRadians(lat2 - lat1);
		double dLon = Math.toRadians(lon2 - lon1);
		double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
				+ Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2)
						* Math.sin(dLon / 2);
		return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
	}

	/** Merkezden {@code {minLon, minLat, maxLon, maxLat}} kutusuna en kısa mesafe (kutu içindeyse 0). */
	static double distanceToBoxMeters(double lat, double lon, double[] box) {
		double nearestLon = Math.max(box[0], Math.min(lon, box[2]));
		double nearestLat = Math.max(box[1], Math.min(lat, box[3]));
		return haversineMeters(lat, lon, nearestLat, nearestLon);
	}

	/**
	 * Merkez çevresindeki kareyi, kenarı {@code maxSpanDeg} dereceyi aşmayan hücrelere böler.
	 * Her hücre {@code {minLon, minLat, maxLon, maxLat}}.
	 */
	static List<double[]> bboxTiles(double lat, double lon, double radiusMeters, double maxSpanDeg) {
		double dLat = radiusMeters / METERS_PER_DEGREE_LAT;
		double dLon = radiusMeters / (METERS_PER_DEGREE_LAT * Math.cos(Math.toRadians(lat)));
		int ny = (int) Math.ceil(2 * dLat / maxSpanDeg);
		int nx = (int) Math.ceil(2 * dLon / maxSpanDeg);
		List<double[]> tiles = new ArrayList<>();
		for (int i = 0; i < nx; i++) {
			for (int j = 0; j < ny; j++) {
				double minLon = lon - dLon + 2 * dLon * i / nx;
				double maxLon = lon - dLon + 2 * dLon * (i + 1) / nx;
				double minLat = lat - dLat + 2 * dLat * j / ny;
				double maxLat = lat - dLat + 2 * dLat * (j + 1) / ny;
				tiles.add(new double[] { minLon, minLat, maxLon, maxLat });
			}
		}
		return tiles;
	}
}
