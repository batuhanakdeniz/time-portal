package com.timeportal.image;

import com.timeportal.geo.ProvinceCenters;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * {@link CityImageFinder} zincirini ve önbelleğini kurar. Mapillary anahtarı yalnızca
 * {@code MAPILLARY_TOKEN} ortam değişkeninden okunur (#44); yoksa ya da biçimi geçersizse
 * (boşluk/kontrol karakteri) Mapillary adımları atlanır.
 */
@Configuration
public class CityImageConfig {

	private static final Logger log = LoggerFactory.getLogger(CityImageConfig.class);

	@Bean
	CityImageFinder cityImageFinder(ProvinceCenters provinceCenters, @Value("${MAPILLARY_TOKEN:}") String token,
			@Value("${timeportal.image.mapillary-ttl:PT24H}") Duration mapillaryTtl,
			@Value("${timeportal.image.commons-ttl:PT12H}") Duration commonsTtl,
			@Value("${timeportal.image.empty-ttl:PT5M}") Duration emptyTtl,
			@Value("${timeportal.image.transient-ttl:PT5M}") Duration transientTtl,
			@Value("${timeportal.image.total-timeout:PT25S}") Duration totalTimeout,
			@Value("${timeportal.image.max-entries:1000}") int maxEntries) {
		Clock clock = Clock.systemUTC();
		// Mapillary isteğinde Authorization başlığı yönlendirmeyle başka bir adrese gitmesin.
		ImageHttp mapillaryHttp = new JdkImageHttp(HttpClient.Redirect.NEVER);
		ImageHttp commonsHttp = new JdkImageHttp(HttpClient.Redirect.NORMAL);
		ChainedCityImageFinder chain = new ChainedCityImageFinder(
				new MapillaryImageSource(mapillaryHttp, sanitizeToken(token), clock),
				new WikimediaCommonsImageSource(commonsHttp), provinceCenters, clock, totalTimeout);
		return new CachingCityImageFinder(chain, clock, mapillaryTtl, commonsTtl, emptyTtl, transientTtl, maxEntries);
	}

	/** Geçerli anahtarı (kenar boşlukları atılmış) döner; geçersizse uyarı loglar (değeri yazmadan) ve boş döner. */
	static String sanitizeToken(String raw) {
		String token = raw == null ? "" : raw.strip();
		if (token.isEmpty() || MapillaryImageSource.isValidToken(token)) {
			return token;
		}
		log.warn("MAPILLARY_TOKEN has an invalid format (whitespace or control characters); ignoring it");
		return "";
	}
}
