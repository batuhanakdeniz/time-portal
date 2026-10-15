package com.timeportal.scene;

import java.net.URI;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/scenes")
public class SceneController {

	/** Gövde alanları boş olabilir ki eksik alan 0 sayılmasın, 400 dönsün. */
	public record CreateSceneBody(Integer year, Double latitude, Double longitude) {

		SceneRequest toRequest() {
			if (year == null || latitude == null || longitude == null) {
				throw new IllegalArgumentException("year, latitude and longitude are required");
			}
			return new SceneRequest(year, latitude, longitude);
		}
	}

	public record SceneJobView(
			String id,
			SceneStatus status,
			SceneRequest request,
			SceneResult result,
			String error,
			Instant createdAt) {

		static SceneJobView of(SceneJob job) {
			return new SceneJobView(job.id(), job.status(), job.request(), job.result(), job.error(),
					job.createdAt());
		}
	}

	private final SceneJobService service;

	public SceneController(SceneJobService service) {
		this.service = service;
	}

	@PostMapping
	public ResponseEntity<SceneJobView> create(@RequestBody CreateSceneBody body) {
		SceneJob job = service.create(body.toRequest());
		return ResponseEntity.accepted().location(URI.create("/api/scenes/" + job.id())).body(SceneJobView.of(job));
	}

	@GetMapping("/{id}")
	public ResponseEntity<SceneJobView> get(@PathVariable String id) {
		return service.find(id).map(job -> ResponseEntity.ok(SceneJobView.of(job)))
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	@ExceptionHandler(IllegalArgumentException.class)
	@ResponseStatus(HttpStatus.BAD_REQUEST)
	public Map<String, String> badRequest(IllegalArgumentException e) {
		return Map.of("error", e.getMessage());
	}
}
