package com.timeportal.image;

import java.io.IOException;
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
 * mesajında görünmez (mesajlar {@link #redact} ile temizlenir). Mapillary bbox'ı en çok 0,01°
 * karedir; büyük yarıçap için alan hücrelere bölünür. Adaylar gerçek mesafeyle (haversine)
 * süzülür ve merkeze en yakını seçilir.
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
	/** API bbox sınırı 0,01° kare; küçük pay bırakılır. */
	static final double MAX_SPAN_DEG = 0.0095;
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
		JsonNode best = null;
		double bestDistance = Double.MAX_VALUE;
		for (double[] t : GeoMath.bboxTiles(latitude, longitude, radiusMeters, MAX_SPAN_DEG)) {
			for (JsonNode item : fetch(t)) {
				JsonNode coords = item.path("computed_geometry").path("coordinates");
				if (!coords.isArray() || coords.size() < 2 || !item.path("is_pano").asBoolean(false)
						|| text(item.path("thumb_2048_url")).isEmpty()) {
					continue;
				}
				double d = GeoMath.haversineMeters(latitude, longitude, coords.get(1).asDouble(), coords.get(0).asDouble());
				if (d <= radiusMeters && d < bestDistance) {
					best = item;
					bestDistance = d;
				}
			}
		}
		return Optional.ofNullable(best).map(MapillaryImageSource::toImage);
	}

	private JsonNode fetch(double[] bbox) {
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
		catch (IOException | JacksonException e) {
			// Neden zincirlenmez: iletim katmanı mesajına anahtar karışmış olsa bile sızmasın.
			throw new ImageSourceException("Mapillary request failed: " + redact(e.getClass().getSimpleName() + " "
					+ e.getMessage()));
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
