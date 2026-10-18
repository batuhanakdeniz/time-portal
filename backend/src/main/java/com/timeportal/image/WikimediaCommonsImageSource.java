package com.timeportal.image;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Wikimedia Commons geosearch ile açık lisanslı fotoğraf arar (anahtarsız).
 *
 * <p>Süzgeçler: yalnızca image/jpeg ve image/png, orijinal genişlik en az {@value #MIN_WIDTH} px,
 * lisans CC0 / kamu malı / CC BY / CC BY-SA ({@code LicenseShortName}; NC, ND, GFDL-only, fair use
 * ve bilinmeyen elenir, {@code NonFree} işaretliler de), ad ya da kategorisi harita, logo, bayrak,
 * arma, diyagram vb. olanlar elenir.
 *
 * <p>Sıralama: önce 360° panoramalar, sonra yatay (genişlik >= yükseklik) fotoğraflar, sonra dikey
 * olanlar; her grupta geosearch sırası (merkeze yakınlık). Panorama: 2:1 (±%3) en-boy oranı ve
 * başlık/kategorilerde 360° / equirectangular / spherical panorama / photosphere işareti.
 */
public class WikimediaCommonsImageSource implements GeoImageSource {

	static final String ENDPOINT = "https://commons.wikimedia.org/w/api.php";
	static final String USER_AGENT = "time-portal/0.1 (https://github.com/batuhanakdeniz/time-portal)";
	static final int MIN_WIDTH = 1024;
	static final int LIMIT = 50;
	static final int MAX_AUTHOR_CHARS = 200;
	private static final String HTTPS = "https://";

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final Pattern EXCLUDED_TOPIC = Pattern.compile(
			"\\b(maps?|logos?|flags?|coats? of arms|diagrams?|locator|seals?|emblems?|charts?|plans?|schemat\\w*|"
					+ "harita\\w*|bayrak\\w*|arma|logo\\w*|kroki\\w*|posters?|screenshots?)\\b",
			Pattern.CASE_INSENSITIVE);
	private static final Pattern PANORAMA_MARK = Pattern.compile(
			"360\\s?°|360[- ]?degrees?|pano360|equirectangular|spherical panorama|photo ?sphere", Pattern.CASE_INSENSITIVE);
	private static final Pattern THUMB_WIDTH = Pattern.compile("/thumb/.*/(\\d+)px-[^/]*$");
	private static final Pattern LICENSE_CC0 = Pattern.compile("^CC0([ -]1\\.0)?( Universal)?$", Pattern.CASE_INSENSITIVE);
	private static final Pattern LICENSE_PD = Pattern.compile(
			"^(public domain|pd([- ].*)?|no restrictions|cc-pd-mark.*|cc pdm.*)$", Pattern.CASE_INSENSITIVE);
	private static final Pattern LICENSE_CC_BY = Pattern.compile(
			"^CC[ -]BY(-SA)?[ -]\\d\\.\\d( [A-Za-z-]+)?$", Pattern.CASE_INSENSITIVE);

	private final ImageHttp http;

	public WikimediaCommonsImageSource(ImageHttp http) {
		this.http = http;
	}

	@Override
	public Optional<CityImage> find(double latitude, double longitude, double radiusMeters) {
		String url = String.format(Locale.ROOT,
				"%s?action=query&format=json&generator=geosearch&ggsnamespace=6&ggscoord=%s&ggsradius=%d&ggslimit=%d"
						+ "&prop=imageinfo&iiprop=url%%7Csize%%7Cmime%%7Cextmetadata&iiurlwidth=2048",
				ENDPOINT, URLEncoder.encode(String.format(Locale.ROOT, "%.6f|%.6f", latitude, longitude), StandardCharsets.UTF_8),
				(int) Math.min(10_000, Math.round(radiusMeters)), LIMIT);
		JsonNode pages;
		try {
			String body = http.get(url, Map.of("User-Agent", USER_AGENT, "Accept", "application/json"));
			pages = JSON.readTree(body).path("query").path("pages");
		}
		catch (IOException | JacksonException e) {
			throw new ImageSourceException("Commons request failed: " + e.getClass().getSimpleName() + " " + e.getMessage());
		}
		List<Candidate> candidates = new ArrayList<>();
		for (JsonNode page : pages) {
			Candidate c = toCandidate(page);
			if (c != null) {
				candidates.add(c);
			}
		}
		return candidates.stream()
			.min(Comparator.comparingInt((Candidate c) -> c.rank()).thenComparingInt(Candidate::index))
			.map(Candidate::image);
	}

	private record Candidate(int rank, int index, CityImage image) {
	}

	private static Candidate toCandidate(JsonNode page) {
		JsonNode info = page.path("imageinfo").path(0);
		if (info.isMissingNode()) {
			return null;
		}
		String mime = text(info.path("mime"));
		if (!mime.equals("image/jpeg") && !mime.equals("image/png")) {
			return null;
		}
		int width = info.path("width").asInt(0);
		int height = info.path("height").asInt(0);
		if (width < MIN_WIDTH || height <= 0) {
			return null;
		}
		JsonNode meta = info.path("extmetadata");
		String license = text(meta.path("LicenseShortName").path("value")).strip();
		if (!isAllowedLicense(license) || "true".equalsIgnoreCase(text(meta.path("NonFree").path("value")))) {
			return null;
		}
		String title = text(page.path("title"));
		String categories = text(meta.path("Categories").path("value"));
		if (EXCLUDED_TOPIC.matcher(title).find() || EXCLUDED_TOPIC.matcher(categories).find()) {
			return null;
		}
		String thumb = text(info.path("thumburl"));
		String url = thumb.isEmpty() ? text(info.path("url")) : thumb;
		if (!url.startsWith(HTTPS)) {
			return null;
		}
		// Commons thumburl'u istenen genişlikten büyük standart adıma yuvarlayabilir ("3840px-"); gerçek
		// boyutu adresten oku. Thumb olmayan (orijinal) adreste orijinal boyut geçerlidir.
		Matcher px = THUMB_WIDTH.matcher(url);
		int outW = width;
		if (px.find()) {
			outW = Math.min(width, Integer.parseInt(px.group(1)));
		}
		int outH = (int) Math.round((double) height * outW / width);
		double ratio = (double) width / height;
		boolean pano = ratio >= 1.94 && ratio <= 2.06
				&& (PANORAMA_MARK.matcher(categories).find() || PANORAMA_MARK.matcher(title).find());
		int rank = pano ? 0 : (width >= height ? 1 : 2);
		String source = text(info.path("descriptionurl"));
		if (!source.startsWith(HTTPS)) {
			return null;
		}
		String author = cleanHtml(text(meta.path("Artist").path("value")));
		if (author.isEmpty()) {
			author = cleanHtml(text(meta.path("Credit").path("value")));
		}
		if (author.isEmpty()) {
			author = "Wikimedia Commons";
		}
		String licenseUrl = text(meta.path("LicenseUrl").path("value"));
		if (licenseUrl.isEmpty() && LICENSE_CC0.matcher(license).matches()) {
			licenseUrl = "https://creativecommons.org/publicdomain/zero/1.0/";
		}
		if (!licenseUrl.startsWith(HTTPS)) {
			licenseUrl = "";
		}
		return new Candidate(rank, page.path("index").asInt(Integer.MAX_VALUE),
				new CityImage(url, pano ? ImageKind.PANORAMA_360 : ImageKind.PHOTO, outW, outH,
						new Attribution(author, license, licenseUrl.isEmpty() ? null : licenseUrl, source)));
	}

	static boolean isAllowedLicense(String license) {
		return LICENSE_CC0.matcher(license).matches() || LICENSE_PD.matcher(license).matches()
				|| LICENSE_CC_BY.matcher(license).matches();
	}

	private static final Pattern TAG = Pattern.compile("<[^>]*>");
	private static final Pattern UNCLOSED_TAG = Pattern.compile("<[^>]*$");
	private static final Pattern NUMERIC_ENTITY = Pattern.compile("&#(x[0-9a-fA-F]{1,6}|\\d{1,7});");

	/**
	 * Commons HTML'inden düz metin çıkarır. Sıra: etiketleri sil (kapanmayan parça dahil) → entity çöz →
	 * kalan {@code <} ve {@code >} karakterlerini at → boşlukları sadeleştir → uzunluğu sınırla.
	 */
	static String cleanHtml(String html) {
		String s = TAG.matcher(html).replaceAll(" ");
		s = UNCLOSED_TAG.matcher(s).replaceAll(" ");
		s = NUMERIC_ENTITY.matcher(s).replaceAll(m -> Matcher.quoteReplacement(decodeNumeric(m.group(1))));
		s = s.replace("&nbsp;", " ")
			.replace("&quot;", "\"")
			.replace("&apos;", "'")
			.replace("&lt;", "<")
			.replace("&gt;", ">")
			.replace("&amp;", "&");
		s = s.replace("<", "").replace(">", "").replaceAll("\\s+", " ").strip();
		return MapillaryImageSource.cap(s, MAX_AUTHOR_CHARS);
	}

	private static String decodeNumeric(String num) {
		try {
			int cp = num.startsWith("x") ? Integer.parseInt(num.substring(1), 16) : Integer.parseInt(num);
			return Character.isValidCodePoint(cp) && !Character.isISOControl(cp) ? new String(Character.toChars(cp)) : " ";
		}
		catch (NumberFormatException e) {
			return " ";
		}
	}

	private static String text(JsonNode n) {
		return n.isMissingNode() || n.isNull() ? "" : n.asString("");
	}
}
