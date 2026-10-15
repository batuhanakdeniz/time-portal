package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SceneControllerTest {

	@Autowired
	MockMvc mockMvc;

	private static String body(int year, double lat, double lon) {
		return "{\"year\":%d,\"latitude\":%s,\"longitude\":%s}".formatted(year, lat, lon);
	}

	@Test
	void createsJobAndItBecomesReady() throws Exception {
		String response = mockMvc.perform(post("/api/scenes")
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(-44, 41.9, 12.5)))
				.andExpect(status().isAccepted())
				.andExpect(header().exists("Location"))
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.request.year").value(-44))
				.andReturn().getResponse().getContentAsString();
		String id = JsonPath.read(response, "$.id");

		String status = "";
		for (int i = 0; i < 100 && !"READY".equals(status); i++) {
			String json = mockMvc.perform(get("/api/scenes/" + id))
					.andExpect(status().isOk())
					.andReturn().getResponse().getContentAsString();
			status = JsonPath.read(json, "$.status");
			if (!"READY".equals(status)) {
				Thread.sleep(20);
			}
		}
		assertThat(status).isEqualTo("READY");

		mockMvc.perform(get("/api/scenes/" + id))
				.andExpect(jsonPath("$.result.panoramaUrl").value("/api/samples/sample-pano.png"))
				.andExpect(jsonPath("$.result.depthUrl").value("/api/samples/sample-depth.png"))
				.andExpect(jsonPath("$.error").doesNotExist());
	}

	@Test
	void sampleImagesAreServed() throws Exception {
		mockMvc.perform(get("/api/samples/sample-pano.png")).andExpect(status().isOk());
		mockMvc.perform(get("/api/samples/sample-depth.png")).andExpect(status().isOk());
	}

	@Test
	void rejectsInvalidLatitude() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content(body(2000, 91, 0)))
				.andExpect(status().isBadRequest());
	}

	@Test
	void rejectsYearZero() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content(body(0, 10, 10)))
				.andExpect(status().isBadRequest());
	}

	@Test
	void rejectsMissingFields() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content("{\"year\":2000}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void unknownJobIsNotFound() throws Exception {
		mockMvc.perform(get("/api/scenes/yok")).andExpect(status().isNotFound());
	}
}
