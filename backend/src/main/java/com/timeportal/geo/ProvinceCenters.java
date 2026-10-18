package com.timeportal.geo;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 81 ilin merkez koordinatı ({@code geo/province-centers.tsv}, Wikidata CC0; bkz. {@code geo/README.md}).
 * {@link District#province()} adıyla aranır. Dönen {@link District}'in adı {@code Merkez}'dir.
 */
@Component
public class ProvinceCenters {

	static final String RESOURCE = "/geo/province-centers.tsv";

	private final Map<String, District> byProvince = new HashMap<>();

	public ProvinceCenters() {
		this(open());
	}

	ProvinceCenters(Reader source) {
		try (BufferedReader in = new BufferedReader(source)) {
			String line;
			while ((line = in.readLine()) != null) {
				if (line.isBlank() || line.startsWith("#")) {
					continue;
				}
				String[] f = line.split("\t");
				byProvince.put(f[0], new District(f[0], "Merkez", Double.parseDouble(f[1]), Double.parseDouble(f[2])));
			}
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	private static Reader open() {
		InputStream in = ProvinceCenters.class.getResourceAsStream(RESOURCE);
		if (in == null) {
			throw new IllegalStateException("missing resource " + RESOURCE);
		}
		return new InputStreamReader(in, StandardCharsets.UTF_8);
	}

	public Optional<District> centerOf(String province) {
		return Optional.ofNullable(byProvince.get(province));
	}

	public int size() {
		return byProvince.size();
	}
}
