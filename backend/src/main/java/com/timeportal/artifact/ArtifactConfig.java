package com.timeportal.artifact;

import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class ArtifactConfig {

	@Bean
	ArtifactStore artifactStore(@Value("${timeportal.artifacts-dir:./data/artifacts}") String dir,
			@Value("${timeportal.artifacts.max-files:2000}") int maxFiles,
			@Value("${timeportal.artifacts.max-bytes:2147483648}") long maxBytes) {
		return new ArtifactStore(Path.of(dir), maxFiles, maxBytes);
	}
}
