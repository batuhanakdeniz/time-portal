package com.timeportal.prompt;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Component;

import com.timeportal.scene.SceneRequest;

/**
 * Deterministik, kural tabanlı {@link PromptComposer}. Harici servis veya LLM çağırmaz.
 *
 * <p><b>Basitleştirme uyarısı:</b> Dönem modeli kaba ve küreseldir. Gerçekte dönemler bölgeye göre
 * çok farklı zamanlarda başlar ve biter (ör. Neolitik farklı kıtalarda çok farklı tarihlerde görülür;
 * tunç/demir çağı kimi bölgelerde hiç yaşanmamıştır). Bu sınıf görsel model için makul bir ipucu
 * üretir, tarihsel doğruluk iddia etmez.
 *
 * <p>Kıta tahmini sınırlayıcı kutularla yapılır ve yaklaşıktır; okyanus/kara ayrımı yapılmaz, bu
 * yüzden tarif bunu varsaymayan nötr ifadeler kullanır. Kutulara uymayan yerler "unknown" sayılır ve
 * tarife hiç bölge adı yazılmaz.
 */
@Component
public class RuleBasedPromptComposer implements PromptComposer {

	// Dönem alt sınırları (dahil). Yıl 0 yoktur; -1 ile 1 aynı dönemdedir.
	static final int NEOLITHIC_START = -10_000;
	static final int BRONZE_IRON_START = -3_000;
	static final int ANTIQUITY_START = -500;
	static final int MEDIEVAL_START = 500;
	static final int EARLY_MODERN_START = 1_500;
	static final int INDUSTRIAL_START = 1_750;
	static final int MODERN_START = 1_900;
	static final int NEAR_FUTURE_START = 2_031;
	static final int FAR_FUTURE_START = 2_201;
	static final int VERY_FAR_FUTURE_START = 10_001;

	// Enlem bantları (mutlak değer, üst sınır dahil).
	static final double TROPICAL_MAX_LAT = 23.5;
	static final double SUBTROPICAL_MAX_LAT = 35;
	static final double TEMPERATE_MAX_LAT = 55;
	static final double SUBARCTIC_MAX_LAT = 66.5;

	private static final String UNKNOWN_REGION = "unknown";

	private record Era(String name, String scenery) {
	}

	private record Box(String name, double minLat, double maxLat, double minLon, double maxLon) {
		boolean contains(double lat, double lon) {
			return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
		}
	}

	private static final Era ICE_AGE = new Era("Ice Age hunter-gatherer era",
			"untouched wilderness, no buildings, a few small campfires far away");
	private static final Era NEOLITHIC = new Era("Neolithic era",
			"early farming hamlet of timber and mud-brick huts, tiny fields, no metal objects");
	private static final Era BRONZE_IRON = new Era("Bronze and early Iron Age",
			"walled town of stone and mud brick, simple farmland, ox carts");
	private static final Era ANTIQUITY = new Era("Classical antiquity",
			"stone town with columns and tiled roofs, market paths, farmland");
	private static final Era MEDIEVAL = new Era("Medieval era",
			"stone and timber village, distant church tower, dirt roads");
	private static final Era EARLY_MODERN = new Era("Early modern era",
			"timber-framed and brick houses, windmills, cobbled lanes");
	private static final Era INDUSTRIAL = new Era("Industrial era",
			"brick factories with smoking chimneys, railway tracks, gas lamps");
	private static final Era MODERN = new Era("Modern era",
			"contemporary buildings, paved roads, power lines");
	private static final Era NEAR_FUTURE = new Era("Near future",
			"green architecture, solar panels, wind turbines, quiet autonomous vehicles");
	private static final Era FAR_FUTURE = new Era("Far future",
			"sleek towers, elevated transit lines, glowing light panels blended with nature");
	private static final Era VERY_FAR_FUTURE = new Era("Very distant future",
			"vast abstract structures and weathered ruins reclaimed by nature under an altered sky");

	// Sıra önemli: ilk eşleşen kazanır. Kutular kaba ve çakışabilir.
	private static final List<Box> REGIONS = List.of(
			new Box("Antarctica", -90, -60, -180, 180),
			new Box("Europe", 63, 67, -25, -13), // İzlanda
			new Box("Europe", 36, 71, -11, 40),
			new Box("Africa", -35, 34, -18, 34),
			new Box("Africa", -35, 12, 34, 52),
			new Box("Asia", 1, 78, 35, 180),
			new Box("Oceania", -50, 0, 110, 180),
			new Box("North America", 7, 84, -170, -52),
			new Box("South America", -56, 13, -82, -34));

	private static final List<String> TIMES_OF_DAY = List.of(
			"soft morning light",
			"bright midday sun",
			"warm golden late-afternoon light",
			"calm dusk light");

	@Override
	public ScenePrompt compose(SceneRequest request) {
		Era era = eraFor(request.year());
		String climate = climateZone(request.latitude());
		String hemisphere = hemisphere(request.latitude());
		String region = region(request.latitude(), request.longitude());
		boolean known = !UNKNOWN_REGION.equals(region);

		String setting = climate + " climate, " + hemisphere + " hemisphere" + (known ? ", " + region : "");

		int slot = Math.floorMod(
				Objects.hash(request.year(), request.latitude(), request.longitude()), TIMES_OF_DAY.size());
		String text = "Seamless 360-degree equirectangular panorama, " + era.name() + ", "
				+ climate + " climate with natural scenery typical of the " + hemisphere + " hemisphere"
				+ (known ? ", " + region : "") + ". "
				+ "Scene: " + era.scenery() + ". "
				+ "Lighting: " + TIMES_OF_DAY.get(slot) + ". "
				+ "Photorealistic, high detail, level horizon, no text, no watermark.";
		return new ScenePrompt(text, era.name(), setting);
	}

	private static Era eraFor(int year) {
		if (year < NEOLITHIC_START) return ICE_AGE;
		if (year < BRONZE_IRON_START) return NEOLITHIC;
		if (year < ANTIQUITY_START) return BRONZE_IRON;
		if (year < MEDIEVAL_START) return ANTIQUITY;
		if (year < EARLY_MODERN_START) return MEDIEVAL;
		if (year < INDUSTRIAL_START) return EARLY_MODERN;
		if (year < MODERN_START) return INDUSTRIAL;
		if (year < NEAR_FUTURE_START) return MODERN;
		if (year < FAR_FUTURE_START) return NEAR_FUTURE;
		if (year < VERY_FAR_FUTURE_START) return FAR_FUTURE;
		return VERY_FAR_FUTURE;
	}

	private static String climateZone(double latitude) {
		double abs = Math.abs(latitude);
		if (abs <= TROPICAL_MAX_LAT) return "tropical";
		if (abs <= SUBTROPICAL_MAX_LAT) return "subtropical";
		if (abs <= TEMPERATE_MAX_LAT) return "temperate";
		if (abs <= SUBARCTIC_MAX_LAT) return "subarctic";
		return "polar";
	}

	private static String hemisphere(double latitude) {
		if (latitude > 0) return "northern";
		if (latitude < 0) return "southern";
		return "equatorial";
	}

	private static String region(double latitude, double longitude) {
		for (Box box : REGIONS) {
			if (box.contains(latitude, longitude)) return box.name();
		}
		return UNKNOWN_REGION;
	}
}
