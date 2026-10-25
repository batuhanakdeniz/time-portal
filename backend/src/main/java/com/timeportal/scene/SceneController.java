package com.timeportal.scene;

import com.timeportal.geo.DistrictLocator;
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

	/** {@code stage} yalnızca RUNNING iken dolu, diğer durumlarda {@code null} (docs/API.md). */
	public record SceneJobView(
			String id,
			SceneStatus status,
			SceneStage stage,
			SceneRequest request,
			SceneResult result,
			String error,
			Instant createdAt) {

		static SceneJobView of(SceneJob job) {
			SceneStage stage = job.status() == SceneStatus.RUNNING ? job.stage() : null;
			return new SceneJobView(job.id(), job.status(), stage, job.request(), job.result(), job.error(),
					job.createdAt());
		}
	}

	private final SceneJobService service;
	private final DistrictLocator districts;

	public SceneController(SceneJobService service, DistrictLocator districts) {
		this.service = service;
		this.districts = districts;
	}

	@PostMapping
	public ResponseEntity<SceneJobView> create(@RequestBody CreateSceneBody body) {
		SceneRequest request = body.toRequest();
		if (districts.locate(request.latitude(), request.longitude()).isEmpty()) {
			throw new InvalidSceneRequestException("location outside supported area");
		}
		SceneJob job = service.create(request);
		return ResponseEntity.accepted().location(URI.create("/api/scenes/" + job.id())).body(SceneJobView.of(job));
	}

	@GetMapping("/{id}")
	public SceneJobView get(@PathVariable String id) {
		return service.find(id).map(SceneJobView::of).orElseThrow(() -> new SceneNotFoundException(id));
	}
}
