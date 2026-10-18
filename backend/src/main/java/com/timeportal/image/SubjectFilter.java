package com.timeportal.image;

import java.util.regex.Pattern;

/**
 * Konu süzgeci (#41): zincirin son adımında (il merkezi fotoğrafı) görselin konusu ilgisiz olabilir
 * (ör. Adana/Aladağ'da böcek fotoğrafı). Kural: başlık ve kategorilerde kentsel/manzara ipucu
 * (sokak, meydan, cami, kale, köprü, manzara, panorama, şehir...) varsa görsel kabul edilir. Hiç
 * ipucu yoksa ve hayvan/böcek/bitki/portre/nesne ipucu varsa elenir. Hiçbir ipucu yoksa (belirsiz)
 * kabul edilir. İpuçları sözcük başı eşleşmesidir ({@code \b} + önek), büyük/küçük harf duyarsız.
 */
final class SubjectFilter {

	private static final int FLAGS = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
			| Pattern.UNICODE_CHARACTER_CLASS;

	private static final Pattern URBAN = Pattern.compile("\\b(street|streets|square|squares|mosque|camii?|meydan\\w*|views?|"
			+ "panoram\\w*|skyline|city|cities|town|towns|center|centre|merkez\\w*|cadde\\w*|sokak\\w*|sokağ\\w*|"
			+ "landscape\\w*|castle\\w*|kale\\w*|bridge\\w*|köprü\\w*|harbou?r\\w*|liman\\w*|building\\w*|tower\\w*|"
			+ "kule\\w*|bazaar\\w*|çarşı\\w*|church\\w*|kilise\\w*|avenue\\w*|road|roads|district\\w*|ilçe\\w*|"
			+ "municipal\\w*|belediye\\w*|hükümet\\w*|konak|village\\w*|köy\\w*|aerial|hotel\\w*|bina\\w*|"
			+ "museum\\w*|müze\\w*|stadium\\w*|boulevard\\w*|bulvar\\w*|plaza|market\\w*|pazar\\w*|rooftop\\w*|"
			+ "valley\\w*|vadi\\w*|coast\\w*|sahil\\w*|lake|göl|gölü|mountain\\w*|dağ\\w*|river\\w*|nehir|"
			+ "monument\\w*|anıt\\w*|statue\\w*|heykel\\w*|fortress\\w*|hisar\\w*|citadel\\w*|türbe\\w*|"
			+ "minaret\\w*|hamam\\w*|cityscape|urban|kent\\w*|şehir\\w*|manzara\\w*|park|parkı|waterfront|"
			+ "seaside|beach\\w*|plaj\\w*)\\b", FLAGS);

	private static final Pattern NON_URBAN = Pattern.compile("\\b(insects?|böcek\\w*|beetles?|butterfl\\w+|"
			+ "kelebek\\w*|moths?|spiders?|örümcek\\w*|bees?|arı|flies|fly|wasps?|ants?|karınca\\w*|birds?|kuş\\w*|"
			+ "animals?|hayvan\\w*|mammals?|fish|balık\\w*|reptiles?|snakes?|yılan\\w*|lizards?|kertenkele\\w*|frogs?|"
			+ "kurbağa\\w*|flowers?|çiçek\\w*|plants?|bitki\\w*|leaf|leaves|yaprak\\w*|fungus|fungi|mushrooms?|mantar\\w*|"
			+ "portraits?|portre\\w*|selfie|persons?|people|man|woman|food|yemek\\w*|dish|specimens?|macro|close-?up|"
			+ "taxon\\w*|species|genus|insecta|lepidoptera|coleoptera|hymenoptera|diptera|araneae|aves|mammalia|"
			+ "flora|fauna|object|product\\w*|ürün\\w*)\\b", FLAGS);

	private SubjectFilter() {
	}

	/** Başlık ve kategori metnine göre görsel konu açısından kabul edilebilir mi? */
	static boolean isRelevant(String title, String categories) {
		String text = (title == null ? "" : title) + " " + (categories == null ? "" : categories);
		if (URBAN.matcher(text).find()) {
			return true;
		}
		return !NON_URBAN.matcher(text).find();
	}
}
