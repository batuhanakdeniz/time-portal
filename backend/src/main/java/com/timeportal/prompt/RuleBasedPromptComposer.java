package com.timeportal.prompt;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
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
 * <p>Kıta/bölge adı yalnızca {@link GeoContext} verirse yazılır; varsayılan olarak hiç yazılmaz.
 * Okyanus/kara ayrımı da yapılamaz, bu yüzden yerleşim öğeleri "arazi uygunsa" koşuluyla anlatılır.
 * Kültüre özgü öğeler (kilise, sütun vb.) kullanılmaz; yalnızca dönemin teknoloji düzeyi anlatılır.
 * Kutup kuşağında ve buzul çağında insan yapımı hiçbir öğe yazılmaz.
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
	/** Bilinçli olarak bugünün yılına (2026) bağlı: "yakın gelecek" şimdiden kısa bir süre sonra başlar. */
	static final int NEAR_FUTURE_START = 2_031;
	static final int FAR_FUTURE_START = 2_201;
	static final int VERY_FAR_FUTURE_START = 10_001;

	// Enlem bantları (mutlak değer, üst sınır dahil).
	static final double TROPICAL_MAX_LAT = 23.5;
	static final double SUBTROPICAL_MAX_LAT = 35;
	static final double TEMPERATE_MAX_LAT = 60;
	static final double SUBARCTIC_MAX_LAT = 66.5;

	private static final long GOLDEN = 0x9E3779B97F4A7C15L;

	/** @param human insan yapımı öğeler; null ise yalnızca doğa anlatılır */
	private record Era(String name, String human) {
	}

	private static final Era ICE_AGE = new Era("Ice Age hunter-gatherer era", null);
	private static final Era NEOLITHIC = new Era("Neolithic era",
			"small settlement of simple hand-built huts from local materials, tiny fields");
	private static final Era BRONZE_IRON = new Era("Bronze and early Iron Age",
			"settlement of hand-built structures from local materials, simple farmland");
	private static final Era ANTIQUITY = new Era("Classical antiquity",
			"settlement with masonry and timber buildings typical of the region, footpaths, farmland");
	private static final Era MEDIEVAL = new Era("Medieval era",
			"village of timber and stone buildings typical of the region, dirt roads, farmland");
	private static final Era EARLY_MODERN = new Era("Early modern era",
			"town of brick and timber buildings typical of the region, unpaved lanes, hand tools");
	private static final Era INDUSTRIAL = new Era("Industrial era",
			"buildings with factory chimneys, railway tracks, early steam machinery");
	private static final Era MODERN = new Era("Modern era",
			"contemporary buildings, paved roads, power lines");
	private static final Era NEAR_FUTURE = new Era("Near future",
			"contemporary buildings with solar panels, wind turbines, quiet electric vehicles");
	private static final Era FAR_FUTURE = new Era("Far future",
			"futuristic architecture, elevated transit lines, glowing light panels blended with nature");
	private static final Era VERY_FAR_FUTURE = new Era("Very distant future",
			"futuristic abstract structures and weathered ruins reclaimed by nature under an altered sky");

	private static final List<String> TIMES_OF_DAY = List.of(
			"soft morning light",
			"bright midday sun",
			"warm golden late-afternoon light",
			"calm dusk light");

	private final GeoContext geoContext;

	@Autowired
	public RuleBasedPromptComposer() {
		this(GeoContext.UNKNOWN);
	}

	public RuleBasedPromptComposer(GeoContext geoContext) {
		this.geoContext = geoContext;
	}

	@Override
	public ScenePrompt compose(SceneRequest request) {
		double lat = request.latitude() + 0.0; // -0.0 -> 0.0
		double lon = request.longitude() + 0.0;
		Era era = eraFor(request.year());
		String climate = climateZone(lat);
		String position = position(lat);
		String region = geoContext.regionName(lat, lon).filter(r -> !r.isBlank()).map(r -> ", " + r).orElse("");

		String setting = climate + " climate, " + position + region;

		String scenery;
		if (era.human() == null || "polar".equals(climate)) {
			scenery = "natural landscape typical of the climate, with rock, ice or vegetation, and a wide sky";
		} else {
			scenery = "natural landscape typical of the climate; where terrain allows, " + era.human();
		}

		int slot = (int) Long.remainderUnsigned(hash(request.year(), lat, lon), TIMES_OF_DAY.size());
		String text = "Seamless 360-degree equirectangular panorama, " + era.name() + ", "
				+ setting + ". Scene: " + scenery + ". "
				+ "Lighting: " + TIMES_OF_DAY.get(slot) + ". "
				+ "Photorealistic, high detail, level horizon, no text, no watermark.";
		return new ScenePrompt(text, era.name(), setting);
	}

	/** Java sürümlerinden bağımsız, iyi karıştıran sabit bir karma (splitmix64). */
	static long hash(int year, double lat, double lon) {
		long x = mix(year * GOLDEN);
		x = mix(x ^ Double.doubleToLongBits(lat + 0.0));
		x = mix(x ^ Double.doubleToLongBits(lon + 0.0));
		return x;
	}

	private static long mix(long z) {
		z += GOLDEN;
		z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
		z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
		return z ^ (z >>> 31);
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

	private static String position(double latitude) {
		if (latitude > 0) return "northern hemisphere";
		if (latitude < 0) return "southern hemisphere";
		return "on the equator";
	}
}
