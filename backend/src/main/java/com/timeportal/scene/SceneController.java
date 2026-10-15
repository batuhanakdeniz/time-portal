package com.timeportal.scene;

import java.net.URI;
import java.time.Instant;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/scenes")
public class SceneController {

	/**
	 * Gövde alanları boş olabilir ki eksik alan 0 sayılmasın, 400 dönsün. Yıl {@link Number} alınır
	 * ki {@code 1.5} sessizce {@code 1}'e kırpılmasın.
	 */
	public record CreateSceneBody(Number year, Double latitude, Double longitude) {

		SceneRequest toRequest() {
			if (year == null || latitude == null || longitude == null) {
				throw new InvalidSceneRequestException("year, latitude and longitude are required");
			}
			double y = year.doubleValue();
			if (y != Math.rint(y) || Math.abs(y) > Integer.MAX_VALUE) {
				throw new InvalidSceneRequestException("year must be an integer");
			}
			try {
				return new SceneRequest((int) y, latitude, longitude);
			}
			catch (IllegalArgumentException e) {
				throw new InvalidSceneRequestException(e.getMessage());
			}
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
	public SceneJobView get(@PathVariable String id) {
		return service.find(id).map(SceneJobView::of).orElseThrow(() -> new SceneNotFoundException(id));
	}
}
