package com.timeportal.image;

import com.timeportal.geo.ProvinceCenters;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * {@link CityImageFinder} zincirini ve önbelleğini kurar. Mapillary anahtarı yalnızca
 * {@code MAPILLARY_TOKEN} ortam değişkeninden okunur (#44); yoksa Mapillary adımları atlanır.
 */
@Configuration
public class CityImageConfig {

	@Bean
	CityImageFinder cityImageFinder(ProvinceCenters provinceCenters, @Value("${MAPILLARY_TOKEN:}") String token,
			@Value("${timeportal.image.mapillary-ttl:PT30M}") Duration mapillaryTtl,
			@Value("${timeportal.image.commons-ttl:PT12H}") Duration commonsTtl,
			@Value("${timeportal.image.empty-ttl:PT5M}") Duration emptyTtl,
			@Value("${timeportal.image.max-entries:1000}") int maxEntries) {
		ImageHttp http = new JdkImageHttp();
		ChainedCityImageFinder chain = new ChainedCityImageFinder(new MapillaryImageSource(http, token),
				new WikimediaCommonsImageSource(http), provinceCenters);
		return new CachingCityImageFinder(chain, Clock.systemUTC(), mapillaryTtl, commonsTtl, emptyTtl, maxEntries);
	}
}
