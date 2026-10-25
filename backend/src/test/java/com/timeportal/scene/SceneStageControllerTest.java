package com.timeportal.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Gecikmeli sahte üreticiyle çalışan işin {@code stage} alanı JSON'da görünür (#61). */
@SpringBootTest(properties = "timeportal.fake-generator.delay-ms=1600")
@AutoConfigureMockMvc
class SceneStageControllerTest {

	private static final List<String> ORDER = List.of("LOCATING", "IMAGE_SEARCH", "DEPTH", "PACKAGING");

	@Autowired
	MockMvc mockMvc;

	@Test
	void runningJobExposesStagesInOrderAndNullOnceReady() throws Exception {
		String response = mockMvc.perform(post("/api/scenes").contentType(MediaType.APPLICATION_JSON)
						.content("{\"year\":1900,\"latitude\":39.92,\"longitude\":32.85}"))
				.andExpect(status().isAccepted())
				.andReturn().getResponse().getContentAsString();
		String id = JsonPath.read(response, "$.id");

		List<String> seen = new ArrayList<>();
		String state = "";
		String json = "";
		long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
		while (System.nanoTime() < deadline) {
			json = mockMvc.perform(get("/api/scenes/" + id)).andReturn().getResponse().getContentAsString();
			state = JsonPath.read(json, "$.status");
			String stage = JsonPath.read(json, "$.stage");
			if ("RUNNING".equals(state) && stage != null && (seen.isEmpty() || !seen.getLast().equals(stage))) {
				seen.add(stage);
			}
			if (!"RUNNING".equals(state)) {
				assertThat(stage).as("stage outside RUNNING").isNull();
			}
			if ("READY".equals(state) || "FAILED".equals(state)) {
				break;
			}
			Thread.sleep(20);
		}

		assertThat(state).isEqualTo("READY");
		assertThat(seen).hasSizeGreaterThanOrEqualTo(2);
		assertThat(ORDER).containsSubsequence(seen);
		assertThat((Object) JsonPath.read(json, "$.stage")).isNull();
		assertThat((String) JsonPath.read(json, "$.result.period.id")).isEqualTo("osmanli-gec");
	}
}
