package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class CityImageConfigTest {

	@Test
	void validTokenIsKeptAndTrimmed() {
		assertThat(CityImageConfig.sanitizeToken("  MLY|1|abc\n")).isEqualTo("MLY|1|abc");
		assertThat(CityImageConfig.sanitizeToken("")).isEmpty();
		assertThat(CityImageConfig.sanitizeToken(null)).isEmpty();
	}

	@Test
	void malformedTokenIsIgnoredWithAWarningThatDoesNotContainIt() {
		Logger logger = (Logger) LoggerFactory.getLogger(CityImageConfig.class);
		ListAppender<ILoggingEvent> logs = new ListAppender<>();
		logs.start();
		logger.addAppender(logs);
		try {
			assertThat(CityImageConfig.sanitizeToken("MLY|1|gizli\u0001deger")).isEmpty();
			assertThat(CityImageConfig.sanitizeToken("MLY|1|gizli deger")).isEmpty();
		}
		finally {
			logger.detachAppender(logs);
		}

		assertThat(logs.list).isNotEmpty().allSatisfy(e -> {
			assertThat(e.getLevel()).isEqualTo(Level.WARN);
			assertThat(e.getFormattedMessage()).doesNotContain("gizli").doesNotContain("MLY");
		});
	}
}
