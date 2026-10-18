package com.timeportal.image;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

	/** Bir aramada en çok bu kadar HTTP isteği (hücre + bölünmüş alt hücreler). */
	static final int MAX_REQUESTS = 40;
	/** Bundan eski görüntüler yalnızca yenisi yoksa seçilir. */
	static final Duration MAX_PREFERRED_AGE = Duration.ofDays(3650);
	static final int MAX_USERNAME_CHARS = 80;
	private static final String HTTPS = "https://";

	private static final Logger log = LoggerFactory.getLogger(MapillaryImageSource.class);
	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final ImageHttp http;
	private final String token;
	private final Clock clock;

	public MapillaryImageSource(ImageHttp http, String token) {
		this(http, token, Clock.systemUTC());
	}

	public MapillaryImageSource(ImageHttp http, String token, Clock clock) {
		this.http = http;
		this.token = token == null ? "" : token.strip();
		this.clock = clock;
	}

	/** Anahtar yalnızca görünür ASCII karakterlerden oluşmalı (boşluk/kontrol karakteri başlığı bozar ya da sızdırır). */
	static boolean isValidToken(String token) {
		if (token == null || token.isEmpty()) {
			return false;
		}
		for (int i = 0; i < token.length(); i++) {
			char c = token.charAt(i);
			if (c < 0x21 || c > 0x7E) {
				return false;
			}
		}
		return true;
	}

	@Override
	public boolean available() {
		return !token.isEmpty();
	}

	@Override
	public Optional<CityImage> find(double latitude, double longitude, double radiusMeters) {
		return find(latitude, longitude, radiusMeters, Deadline.none());
	}

	@Override
	public Optional<CityImage> find(double latitude, double longitude, double radiusMeters, Deadline deadline) {
		Scan scan = new Scan(radiusMeters, deadline);
		List<double[]> tiles = new ArrayList<>(GeoMath.bboxTiles(latitude, longitude, radiusMeters, MAX_SPAN_DEG));
		tiles.sort(Comparator.comparingDouble(t -> GeoMath.distanceToBoxMeters(latitude, longitude, t)));
		try {
			for (double[] t : tiles) {
				scanTile(latitude, longitude, t, 0, scan);
			}
		}
		catch (ImageSourceException e) {
			if (!scan.hasResult()) {
				throw e;
			}
			deadline.markDegraded();
			log.warn("Mapillary cell failed, returning the best panorama found so far: {}", e.getMessage());
		}
		return Optional.ofNullable(scan.result()).map(MapillaryImageSource::toImage);
	}

	/** En iyi adayı tutar: yeni görüntüler eskilere (>10 yıl) tercih edilir, sonra merkeze yakınlık. */
	private static final class Slot {
		double distance;
		JsonNode item;

		Slot(double radius) {
			this.distance = radius;
		}

		void offer(JsonNode candidate, double d) {
			if (d < distance || (d == distance && item == null)) {
				item = candidate;
				distance = d;
			}
		}
	}

	private final class Scan {
		final Slot recent;
		final Slot old;
		final Deadline deadline;
		int requests;

		Scan(double radius, Deadline deadline) {
			this.recent = new Slot(radius);
			this.old = new Slot(radius);
			this.deadline = deadline;
		}

		boolean canContinue() {
			return !deadline.expired() && requests < MAX_REQUESTS;
		}

		/** Yalnızca yeni aday uzak hücreleri eler; eski aday daha yeni bir görüntüyü engellememeli. */
		double pruneDistance() {
			return recent.distance;
		}

		boolean hasResult() {
			return recent.item != null || old.item != null;
		}

		JsonNode result() {
			return recent.item != null ? recent.item : old.item;
		}

		void offer(JsonNode item, double d) {
			long capturedAt = item.path("captured_at").asLong(0);
			boolean tooOld = capturedAt > 0
					&& Instant.ofEpochMilli(capturedAt).isBefore(clock.instant().minus(MAX_PREFERRED_AGE));
			(tooOld ? old : recent).offer(item, d);
		}
	}

	private static final class ShrinkRequested extends Exception {
		ShrinkRequested() {
			super(null, null, false, false);
		}
	}

	private void scanTile(double lat, double lon, double[] tile, int depth, Scan scan) {
		if (GeoMath.distanceToBoxMeters(lat, lon, tile) >= scan.pruneDistance()) {
			return;
		}
		if (!scan.canContinue()) {
			// Taranması gereken hücre kaldı ama süre/istek sınırı doldu: sonuç kısmi.
			scan.deadline.markDegraded();
			return;
		}
		JsonNode data;
		try {
			scan.requests++;
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
				scanTile(lat, lon, part, depth + 1, scan);
			}
			return;
		}
		for (JsonNode item : data) {
			JsonNode coords = item.path("computed_geometry").path("coordinates");
			if (!coords.isArray() || coords.size() < 2 || !item.path("is_pano").asBoolean(false)
					|| !text(item.path("thumb_2048_url")).startsWith(HTTPS)) {
				continue;
			}
			scan.offer(item, GeoMath.haversineMeters(lat, lon, coords.get(1).asDouble(), coords.get(0).asDouble()));
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
		catch (ImageSourceException e) {
			throw e;
		}
		catch (HttpStatusException e) {
			if (e.status() == 500 && isReduceDataError(e.body())) {
				throw new ShrinkRequested();
			}
			throw new ImageSourceException("Mapillary request failed: HTTP " + e.status());
		}
		catch (IOException | RuntimeException e) {
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
		String user = cap(text(item.path("creator").path("username")), MAX_USERNAME_CHARS);
		String author = "© Mapillary katkıcıları" + (user.isEmpty() ? "" : ", " + user);
		String id = text(item.path("id"));
		return new CityImage(text(item.path("thumb_2048_url")), ImageKind.PANORAMA_360, 2048, height,
				new Attribution(author, LICENSE, LICENSE_URL, "https://www.mapillary.com/app/?pKey=" + id,
						Attribution.MAPILLARY));
	}

	static String cap(String s, int maxChars) {
		String t = s.strip();
		if (t.codePointCount(0, t.length()) <= maxChars) {
			return t;
		}
		return t.substring(0, t.offsetByCodePoints(0, maxChars)).strip();
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
