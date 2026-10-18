package com.timeportal.artifact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class ArtifactControllerTest {

	@Autowired
	MockMvc mockMvc;

	@Autowired
	ArtifactStore store;

	@Test
	void servesJpegWithImmutableCaching() throws Exception {
		byte[] bytes = {(byte) 0xFF, (byte) 0xD8, 1, 2, 3, (byte) 0xAB};
		String name = store.saveImage(bytes, "jpg");

		mockMvc.perform(get("/api/artifacts/" + name))
			.andExpect(status().isOk())
			.andExpect(content().contentType("image/jpeg"))
			.andExpect(content().bytes(bytes))
			.andExpect(header().string(HttpHeaders.CACHE_CONTROL, "max-age=31536000, public, immutable"))
			.andExpect(header().string("X-Content-Type-Options", "nosniff"));
	}

	@Test
	void servesDepthPngWithPngContentType() throws Exception {
		String image = store.saveImage(new byte[] {4, 5, 6, 7, 1}, "jpg");
		String depth = store.saveDepth(image, new byte[] {(byte) 0x89, 'P', 'N', 'G'});

		mockMvc.perform(get("/api/artifacts/" + depth))
			.andExpect(status().isOk())
			.andExpect(content().contentType("image/png"));
	}

	@Test
	void unknownValidNameIs404WithErrorBody() throws Exception {
		mockMvc.perform(get("/api/artifacts/ffffffffffffffff.jpg"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.error").value("artifact not found"));
	}

	@Test
	void traversalAndMalformedNamesAre404() throws Exception {
		store.saveImage(new byte[] {8, 8, 8}, "jpg");
		String[] paths = {"/api/artifacts/..", "/api/artifacts/%2e%2e", "/api/artifacts/%2e%2e%2f%2e%2e%2fpom.xml",
				"/api/artifacts/..%2fapplication.properties", "/api/artifacts/%2Fetc%2Fpasswd",
				"/api/artifacts/0123456789abcdef.gif", "/api/artifacts/0123456789abcdef.jpg.exe",
				"/api/artifacts/0123456789ABCDEF.jpg", "/api/artifacts/a.png", "/api/artifacts/%2e%2e/%2e%2e/etc/passwd",
				"/api/artifacts/..;/x.jpg", "/api/artifacts/0123456789abcdef.jpg%00.png"};
		for (String path : paths) {
			int status = mockMvc.perform(get(path)).andReturn().getResponse().getStatus();
			assertThat(status).as(path).isEqualTo(404);
		}
	}

	@Test
	void absolutePathIs404() throws Exception {
		int status = mockMvc.perform(get("/api/artifacts//etc/passwd")).andReturn().getResponse().getStatus();
		assertThat(status).isEqualTo(404);
	}
}
