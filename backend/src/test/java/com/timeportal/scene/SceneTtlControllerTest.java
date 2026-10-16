package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "timeportal.jobs.ttl=PT10M")
@AutoConfigureMockMvc
@Import(SceneTtlControllerTest.ClockConfig.class)
class SceneTtlControllerTest {

	@TestConfiguration
	static class ClockConfig {
		@Bean
		SceneJobServiceTest.MutableClock clock() {
			return new SceneJobServiceTest.MutableClock();
		}
	}

	@Autowired
	MockMvc mockMvc;

	@Autowired
	SceneJobServiceTest.MutableClock clock;

	@Test
	void finishedJobIsNotFoundAfterTtl() throws Exception {
		String response = mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON)
						.content("{\"year\":-44,\"latitude\":41.9,\"longitude\":12.5}"))
				.andExpect(status().isAccepted())
				.andReturn().getResponse().getContentAsString();
		String id = JsonPath.read(response, "$.id");

		String state = "";
		long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
		while (!"READY".equals(state) && System.nanoTime() < deadline) {
			String json = mockMvc.perform(get("/api/scenes/" + id)).andExpect(status().isOk())
					.andReturn().getResponse().getContentAsString();
			state = JsonPath.read(json, "$.status");
			Thread.sleep(20);
		}
		assertThat(state).isEqualTo("READY");

		clock.advance(Duration.ofMinutes(10));
		mockMvc.perform(get("/api/scenes/" + id))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error").isNotEmpty());
	}
}
