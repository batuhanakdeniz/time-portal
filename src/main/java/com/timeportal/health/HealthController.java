package com.timeportal.health;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {

	public record Health(String status, String service) {
	}

	@GetMapping
	public Health health() {
		return new Health("UP", "time-portal");
	}
}
