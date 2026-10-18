package com.timeportal.geo;

import java.util.List;

/** Nokta-poligon yardımcıları (düzlemsel, derece birimiyle; Türkiye ölçeğinde yeterli). */
public final class PointInPolygon {

	private PointInPolygon() {
	}

	/** Işın atma (even-odd). Halka düz {@code x,y,x,y,...} dizisi. */
	public static boolean inRing(double[] ring, double x, double y) {
		boolean inside = false;
		int n = ring.length / 2;
		for (int i = 0, j = n - 1; i < n; j = i++) {
			double xi = ring[2 * i];
			double yi = ring[2 * i + 1];
			double xj = ring[2 * j];
			double yj = ring[2 * j + 1];
			if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
				inside = !inside;
			}
		}
		return inside;
	}

	/** MultiPolygon: parçalardan herhangi birinin içindeyse true. */
	public static boolean containsAny(List<Polygon> parts, double x, double y) {
		for (Polygon p : parts) {
			if (p.contains(x, y)) {
				return true;
			}
		}
		return false;
	}

	/** Noktanın halkanın kenarlarına en kısa uzaklığı. */
	public static double distanceToRing(double[] ring, double x, double y) {
		int n = ring.length / 2;
		double best = Double.MAX_VALUE;
		for (int i = 0, j = n - 1; i < n; j = i++) {
			best = Math.min(best, distanceToSegment(x, y, ring[2 * j], ring[2 * j + 1], ring[2 * i], ring[2 * i + 1]));
		}
		return best;
	}

	static double distanceToSegment(double px, double py, double ax, double ay, double bx, double by) {
		double dx = bx - ax;
		double dy = by - ay;
		double l2 = dx * dx + dy * dy;
		double t = l2 == 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
		return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
	}
}
