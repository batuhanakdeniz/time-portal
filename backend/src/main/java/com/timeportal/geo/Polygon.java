package com.timeportal.geo;

import java.util.List;

/**
 * Delikli düz poligon. Halkalar düz {@code x0,y0,x1,y1,...} dizisidir (x = boylam, y = enlem);
 * halka açık yazılır (ilk köşe sonda tekrarlanmaz). Sınır kutusu kurucuda hesaplanır.
 */
public final class Polygon {

	private final double[] outer;
	private final List<double[]> holes;
	private final double minX;
	private final double minY;
	private final double maxX;
	private final double maxY;

	public Polygon(double[] outer, List<double[]> holes) {
		if (outer.length < 6 || outer.length % 2 != 0) {
			throw new IllegalArgumentException("outer ring needs at least 3 vertices");
		}
		this.outer = outer;
		this.holes = List.copyOf(holes);
		double x0 = Double.MAX_VALUE;
		double y0 = Double.MAX_VALUE;
		double x1 = -Double.MAX_VALUE;
		double y1 = -Double.MAX_VALUE;
		for (int i = 0; i < outer.length; i += 2) {
			x0 = Math.min(x0, outer[i]);
			x1 = Math.max(x1, outer[i]);
			y0 = Math.min(y0, outer[i + 1]);
			y1 = Math.max(y1, outer[i + 1]);
		}
		minX = x0;
		minY = y0;
		maxX = x1;
		maxY = y1;
	}

	public boolean mayContain(double x, double y, double margin) {
		return x >= minX - margin && x <= maxX + margin && y >= minY - margin && y <= maxY + margin;
	}

	/** Nokta dış halkanın içinde ve hiçbir deliğin içinde değilse true. */
	public boolean contains(double x, double y) {
		if (!mayContain(x, y, 0) || !PointInPolygon.inRing(outer, x, y)) {
			return false;
		}
		for (double[] hole : holes) {
			if (PointInPolygon.inRing(hole, x, y)) {
				return false;
			}
		}
		return true;
	}

	/** Noktanın en yakın halka kenarına (dış ya da delik) uzaklığı; derece birimiyle düzlemsel. */
	public double distanceToBoundary(double x, double y) {
		double best = PointInPolygon.distanceToRing(outer, x, y);
		for (double[] hole : holes) {
			best = Math.min(best, PointInPolygon.distanceToRing(hole, x, y));
		}
		return best;
	}
}
