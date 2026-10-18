package com.timeportal.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class CleanHtmlAndLicenseTest {

	@Test
	void manyOpeningBracketsWithoutClosingRunInLinearTime() {
		String input = "<".repeat(1_000_000);

		long start = System.nanoTime();
		String r = WikimediaCommonsImageSource.cleanHtml(input);

		assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofMillis(500));
		assertThat(r.length()).isLessThanOrEqualTo(WikimediaCommonsImageSource.MAX_AUTHOR_CHARS);
		assertThat(r).doesNotContain("<", ">");
	}

	@Test
	void manyUnclosedTagStartsRunInLinearTime() {
		String input = "<a ".repeat(100_000);

		long start = System.nanoTime();
		String r = WikimediaCommonsImageSource.cleanHtml(input);

		assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofMillis(500));
		assertThat(r.length()).isLessThanOrEqualTo(WikimediaCommonsImageSource.MAX_AUTHOR_CHARS);
	}

	@Test
	void xssCasesStayClean() {
		assertThat(WikimediaCommonsImageSource.cleanHtml("<script>alert(1)</script>")).doesNotContain("<", ">", "script>");
		assertThat(WikimediaCommonsImageSource.cleanHtml("&lt;script&gt;alert(1)&lt;/script&gt;")).doesNotContain("<", ">");
		assertThat(WikimediaCommonsImageSource.cleanHtml("Foto <img src=x onerror=alert(1)")).isEqualTo("Foto");
	}

	@Test
	void knownLicenseNamesFallBackToStandardUrls() {
		assertThat(WikimediaCommonsImageSource.defaultLicenseUrl("CC0")).isEqualTo("https://creativecommons.org/publicdomain/zero/1.0/");
		assertThat(WikimediaCommonsImageSource.defaultLicenseUrl("CC BY-SA 4.0"))
			.isEqualTo("https://creativecommons.org/licenses/by-sa/4.0/");
		assertThat(WikimediaCommonsImageSource.defaultLicenseUrl("CC BY 2.0")).isEqualTo("https://creativecommons.org/licenses/by/2.0/");
		assertThat(WikimediaCommonsImageSource.defaultLicenseUrl("Public domain")).isEmpty();
	}
}
