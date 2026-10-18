package com.timeportal.artifact;

import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/artifacts/{name}}: üretilen görsel ve derinlik PNG'leri. Ad içerik özetidir, bu
 * yüzden değişmez ve bir yıl önbelleğe alınabilir. Kalıba uymayan ya da olmayan ad 404 döner.
 */
@RestController
@RequestMapping("/api/artifacts")
public class ArtifactController {

	private final ArtifactStore store;

	public ArtifactController(ArtifactStore store) {
		this.store = store;
	}

	static class ArtifactNotFoundException extends RuntimeException {
		ArtifactNotFoundException() {
			super("artifact not found");
		}
	}

	@GetMapping("/{name}")
	public ResponseEntity<Resource> get(@PathVariable String name) {
		Path file = store.resolve(name).orElseThrow(ArtifactNotFoundException::new);
		MediaType type = name.endsWith(".jpg") ? MediaType.IMAGE_JPEG : MediaType.IMAGE_PNG;
		return ResponseEntity.ok()
			.contentType(type)
			.cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
			.header("X-Content-Type-Options", "nosniff")
			.body(new FileSystemResource(file));
	}

	@ExceptionHandler(ArtifactNotFoundException.class)
	@ResponseStatus(HttpStatus.NOT_FOUND)
	Map<String, String> notFound(ArtifactNotFoundException e) {
		return Map.of("error", e.getMessage());
	}
}
