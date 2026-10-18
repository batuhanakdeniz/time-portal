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
						.content(body(-44, 39.92, 32.85)))
				.andExpect(status().isAccepted())
				.andExpect(header().exists("Location"))
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.request.year").value(-44))
				.andReturn().getResponse().getContentAsString();
		String id = JsonPath.read(response, "$.id");

		String state = "";
		long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
		while (System.nanoTime() < deadline) {
			String json = mockMvc.perform(get("/api/scenes/" + id))
					.andExpect(status().isOk())
					.andReturn().getResponse().getContentAsString();
			state = JsonPath.read(json, "$.status");
			if ("READY".equals(state) || "FAILED".equals(state)) {
				break;
			}
			Thread.sleep(20);
		}
		assertThat(state).isEqualTo("READY");

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
	void rejectsInvalidLatitudeBeforeLocationCheck() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content(body(2000, 91, 0)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("latitude must be between -90 and 90"));
	}

	@Test
	void rejectsYearZero() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content(body(0, 39.92, 32.85)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("year must be")));
	}

	@Test
	void rejectsMissingFields() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content("{\"year\":2000}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void unknownJobIsNotFoundWithErrorBody() throws Exception {
		mockMvc.perform(get("/api/scenes/yok"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error").isNotEmpty());
	}

	@Test
	void invalidRequestReturnsErrorBody() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content(body(2000, 91, 0)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").isNotEmpty());
	}

	@Test
	void malformedJsonReturnsErrorBody() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content("{bozuk"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").isNotEmpty());
	}

	@Test
	void wrongTypeReturnsErrorBody() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON)
						.content("{\"year\":\"abc\",\"latitude\":39.92,\"longitude\":32.85}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").isNotEmpty());
	}

	@Test
	void fractionalYearIsRejected() throws Exception {
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON)
						.content("{\"year\":1.5,\"latitude\":39.92,\"longitude\":32.85}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("year must be an integer"));
	}

	@Test
	void locationOutsideTurkeyIsRejected() throws Exception {
		// Atina
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content(body(2000, 37.98, 23.73)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("location outside supported area"));
	}

	@Test
	void locationInTheSeaIsRejected() throws Exception {
		// Ege Denizi
		mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON).content(body(2000, 38.5, 25.0)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("location outside supported area"));
	}
}
