package com.timeportal.image;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Mapillary Graph API v4 ile 360° panorama arar ({@code is_pano=true}).
 *
 * <p>Erişim anahtarı yalnızca {@code Authorization: OAuth} başlığında gider; URL'de, logda ve hata
 * mesajında görünmez (mesajlar {@link #redact} ile temizlenir).
 *
 * <p>Arama alanı küçük hücrelere bölünür ({@value #MAX_SPAN_DEG}° kenar; belgedeki sınır 0,01°'dir
 * ama gerçek denemede yoğun bölgede ~0,02° kutu "Please reduce the amount of data" HTTP 500
 * döndürdü). Hücreler merkeze yakından uzağa taranır; bulunan adaydan uzak hücreler atlanır. Yine de
 * 500 + {@code error.code 1} gelirse bu kaynak hatası sayılmaz: hücre dörde bölünüp yeniden denenir
 * (en çok {@value #MAX_SPLIT_DEPTH} kez). Geçersiz anahtar da 500 döndürür ama {@code error.code 1}
 * değildir, normal kaynak hatasıdır. Adaylar gerçek mesafeyle (haversine) süzülür, merkeze en yakını seçilir.
 *
 * <p>Atıf: "© Mapillary katkıcıları, kullanıcı adı", lisans CC BY-SA 4.0 (Mapillary şartları md. 3b).
 * Mapillary şartları geliştiriciden görseli sunarken Mapillary logosunu ve bir bağlantıyı da
 * göstermesini ister (arayüz işi, #42).
 */
public class MapillaryImageSource implements GeoImageSource {

	static final String ENDPOINT = "https://graph.mapillary.com/images";
	static final String FIELDS = "id,thumb_2048_url,width,height,is_pano,creator,captured_at,computed_geometry";
	static final String LICENSE = "CC BY-SA 4.0";
	static final String LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";
	static final double MAX_SPAN_DEG = 0.004;
	static final int MAX_SPLIT_DEPTH = 3;
	static final int LIMIT = 200;

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final ImageHttp http;
	private final String token;

	public MapillaryImageSource(ImageHttp http, String token) {
		this.http = http;
		this.token = token == null ? "" : token.strip();
	}

	@Override
	public boolean available() {
		return !token.isEmpty();
	}

	@Override
	public Optional<CityImage> find(double latitude, double longitude, double radiusMeters) {
		Best best = new Best(radiusMeters);
		List<double[]> tiles = new ArrayList<>(GeoMath.bboxTiles(latitude, longitude, radiusMeters, MAX_SPAN_DEG));
		tiles.sort(Comparator.comparingDouble(t -> GeoMath.distanceToBoxMeters(latitude, longitude, t)));
		for (double[] t : tiles) {
			scan(latitude, longitude, t, 0, best);
		}
		return Optional.ofNullable(best.item).map(MapillaryImageSource::toImage);
	}

	private static final class Best {
		double distance;
		JsonNode item;

		Best(double radius) {
			this.distance = radius;
		}
	}

	private static final class ShrinkRequested extends Exception {
		ShrinkRequested() {
			super(null, null, false, false);
		}
	}

	private void scan(double lat, double lon, double[] tile, int depth, Best best) {
		if (GeoMath.distanceToBoxMeters(lat, lon, tile) >= best.distance) {
			return;
		}
		JsonNode data;
		try {
			data = fetch(tile);
		}
		catch (ShrinkRequested e) {
			if (depth >= MAX_SPLIT_DEPTH) {
				throw new ImageSourceException("Mapillary: too much data even for the smallest cell");
			}
			double midLon = (tile[0] + tile[2]) / 2;
			double midLat = (tile[1] + tile[3]) / 2;
			List<double[]> parts = new ArrayList<>(List.of(new double[] { tile[0], tile[1], midLon, midLat },
					new double[] { midLon, tile[1], tile[2], midLat }, new double[] { tile[0], midLat, midLon, tile[3] },
					new double[] { midLon, midLat, tile[2], tile[3] }));
			parts.sort(Comparator.comparingDouble(t -> GeoMath.distanceToBoxMeters(lat, lon, t)));
			for (double[] part : parts) {
				scan(lat, lon, part, depth + 1, best);
			}
			return;
		}
		for (JsonNode item : data) {
			JsonNode coords = item.path("computed_geometry").path("coordinates");
			if (!coords.isArray() || coords.size() < 2 || !item.path("is_pano").asBoolean(false)
					|| text(item.path("thumb_2048_url")).isEmpty()) {
				continue;
			}
			double d = GeoMath.haversineMeters(lat, lon, coords.get(1).asDouble(), coords.get(0).asDouble());
			if (d < best.distance || (d == best.distance && best.item == null)) {
				best.item = item;
				best.distance = d;
			}
		}
	}

	private JsonNode fetch(double[] bbox) throws ShrinkRequested {
		String url = String.format(Locale.ROOT, "%s?fields=%s&is_pano=true&bbox=%.6f,%.6f,%.6f,%.6f&limit=%d", ENDPOINT,
				FIELDS, bbox[0], bbox[1], bbox[2], bbox[3], LIMIT);
		try {
			String body = http.get(url, Map.of("Authorization", "OAuth " + token));
			JsonNode data = JSON.readTree(body).path("data");
			if (!data.isArray()) {
				throw new ImageSourceException("Mapillary response has no data array");
			}
			return data;
		}
		catch (HttpStatusException e) {
			if (e.status() == 500 && isReduceDataError(e.body())) {
				throw new ShrinkRequested();
			}
			throw new ImageSourceException("Mapillary request failed: HTTP " + e.status());
		}
		catch (IOException | JacksonException e) {
			// Neden zincirlenmez: iletim katmanı mesajına anahtar karışmış olsa bile sızmasın.
			throw new ImageSourceException("Mapillary request failed: " + redact(e.getClass().getSimpleName() + " "
					+ e.getMessage()));
		}
	}

	private static boolean isReduceDataError(String body) {
		try {
			return JSON.readTree(body).path("error").path("code").asInt(0) == 1;
		}
		catch (JacksonException e) {
			return false;
		}
	}

	private static CityImage toImage(JsonNode item) {
		int w = item.path("width").asInt(0);
		int h = item.path("height").asInt(0);
		// thumb_2048_url 2048 piksel genişliğindedir.
		int height = w > 0 && h > 0 ? (int) Math.round(2048.0 * h / w) : 1024;
		String user = text(item.path("creator").path("username"));
		String author = "© Mapillary katkıcıları" + (user.isEmpty() ? "" : ", " + user);
		String id = text(item.path("id"));
		return new CityImage(text(item.path("thumb_2048_url")), ImageKind.PANORAMA_360, 2048, height,
				new Attribution(author, LICENSE, LICENSE_URL, "https://www.mapillary.com/app/?pKey=" + id));
	}

	private static String text(JsonNode n) {
		return n.isMissingNode() || n.isNull() ? "" : n.asString("");
	}

	String redact(String message) {
		String m = message == null ? "" : message;
		return token.isEmpty() ? m : m.replace(token, "***");
	}

	@Override
	public String toString() {
		return "MapillaryImageSource[token=" + (available() ? "set" : "unset") + "]";
	}
}
