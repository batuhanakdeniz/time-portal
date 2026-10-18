package com.timeportal.geo;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Gömülü ilçe poligonlarıyla çevrimdışı çalışan {@link DistrictLocator}. Veri başlangıçta bir kez
 * yüklenir (biçim: {@code geo/README.md}).
 *
 * <p>Sadeleştirme yüzünden komşu ilçeler arasında dar boşluklar kalabilir; hiçbir poligon noktayı
 * içermiyorsa, sınırına {@value #BORDER_TOLERANCE_DEG} dereceden (~300 m) yakın en yakın ilçe döner.
 * Bundan uzaktaki nokta (deniz, yurt dışı) için sonuç boştur.
 */
@Component
public class PolygonDistrictLocator implements DistrictLocator {

	static final String RESOURCE = "/geo/districts.txt";
	static final double BORDER_TOLERANCE_DEG = 0.003;

	private record Shape(District district, List<Polygon> parts) {
	}

	private final List<Shape> shapes;

	public PolygonDistrictLocator() {
		this(open());
	}

	PolygonDistrictLocator(Reader source) {
		this.shapes = parse(source);
	}

	private static Reader open() {
		InputStream in = PolygonDistrictLocator.class.getResourceAsStream(RESOURCE);
		if (in == null) {
			throw new IllegalStateException("missing resource " + RESOURCE);
		}
		return new InputStreamReader(in, StandardCharsets.UTF_8);
	}

	public List<District> districts() {
		return shapes.stream().map(Shape::district).toList();
	}

	@Override
	public Optional<District> locate(double latitude, double longitude) {
		Shape best = null;
		double bestCenterDist = Double.MAX_VALUE;
		for (Shape s : shapes) {
			if (anyContains(s, longitude, latitude)) {
				// çakışan komşular varsa merkezi daha yakın olanı seç
				double d = Math.hypot(s.district().centerLon() - longitude, s.district().centerLat() - latitude);
				if (d < bestCenterDist) {
					best = s;
					bestCenterDist = d;
				}
			}
		}
		if (best != null) {
			return Optional.of(best.district());
		}
		double bestBorder = BORDER_TOLERANCE_DEG;
		for (Shape s : shapes) {
			for (Polygon p : s.parts()) {
				if (p.mayContain(longitude, latitude, BORDER_TOLERANCE_DEG)) {
					double d = p.distanceToBoundary(longitude, latitude);
					if (d <= bestBorder) {
						bestBorder = d;
						best = s;
					}
				}
			}
		}
		return Optional.ofNullable(best).map(Shape::district);
	}

	private static boolean anyContains(Shape s, double x, double y) {
		return PointInPolygon.containsAny(s.parts(), x, y);
	}

	// D<TAB>ad<TAB>il<TAB>enlem<TAB>boylam<TAB>kaynak | P | O x y x y ... | H x y x y ...
	private static List<Shape> parse(Reader source) {
		List<Shape> out = new ArrayList<>(1000);
		District district = null;
		List<Polygon> parts = null;
		double[] outer = null;
		List<double[]> holes = null;
		try (BufferedReader r = new BufferedReader(source)) {
			String line;
			int lineNo = 0;
			while ((line = r.readLine()) != null) {
				lineNo++;
				try {
				if (line.isEmpty() || line.charAt(0) == '#') {
					continue;
				}
				char kind = line.charAt(0);
				if (kind == 'D' || kind == 'P') {
					if (outer != null) {
						parts.add(new Polygon(outer, holes));
						outer = null;
					}
				}
				if (kind == 'D') {
					if (district != null) {
						out.add(new Shape(district, parts));
					}
					String[] f = line.split("\t");
					district = new District(f[2], f[1], Double.parseDouble(f[3]), Double.parseDouble(f[4]));
					parts = new ArrayList<>();
				}
				else if (kind == 'P') {
					holes = new ArrayList<>();
				}
				else if (kind == 'O') {
					outer = numbers(line);
				}
				else if (kind == 'H') {
					holes.add(numbers(line));
				}
				else {
					throw new IllegalArgumentException("unknown record type '" + kind + "'");
				}
				}
				catch (RuntimeException e) {
					throw new IllegalStateException("invalid district data at line " + lineNo + ": " + e.getMessage(), e);
				}
			}
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		if (outer != null) {
			parts.add(new Polygon(outer, holes));
		}
		if (district != null) {
			out.add(new Shape(district, parts));
		}
		return List.copyOf(out);
	}

	private static double[] numbers(String line) {
		// "O 1 2 3 4": ilk iki karakterden sonrası
		int n = 0;
		for (int i = 2; i < line.length(); i++) {
			if (line.charAt(i) == ' ') {
				n++;
			}
		}
		double[] a = new double[n + 1];
		int idx = 0;
		int start = 2;
		for (int i = 2; i <= line.length(); i++) {
			if (i == line.length() || line.charAt(i) == ' ') {
				a[idx++] = Double.parseDouble(line.substring(start, i));
				start = i + 1;
			}
		}
		return a;
	}
}
