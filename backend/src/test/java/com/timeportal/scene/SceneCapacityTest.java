package com.timeportal.scene;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"timeportal.jobs.max-active=1", "timeportal.fake-generator.delay-ms=5000"})
@AutoConfigureMockMvc
class SceneCapacityTest {

	@Autowired
	MockMvc mockMvc;

	@Test
	void secondRequestGets503WithRetryAfterAndErrorBody() throws Exception {
		String json = "{\"year\":-44,\"latitude\":41.9,\"longitude\":12.5}";
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content(json))
				.andExpect(status().isAccepted());
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content(json))
				.andExpect(status().isServiceUnavailable())
				.andExpect(header().string("Retry-After", "5"))
				.andExpect(jsonPath("$.error").isNotEmpty());
	}
}
