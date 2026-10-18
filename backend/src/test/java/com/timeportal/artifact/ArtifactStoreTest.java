package com.timeportal.artifact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ArtifactStoreTest {

	@TempDir
	Path dir;

	@Test
	void validNamesMatchTheContract() {
		assertThat(ArtifactStore.isValidName("0123456789abcdef.jpg")).isTrue();
		assertThat(ArtifactStore.isValidName("0123456789abcdef.png")).isTrue();
		assertThat(ArtifactStore.isValidName("0123456789abcdef-depth.png")).isTrue();
	}

	@Test
	void invalidNamesAreRejected() {
		String[] bad = {"../0123456789abcdef.jpg", "..", ".", "", "/etc/passwd", "0123456789abcdef.gif",
				"0123456789abcdef.jpg ", "0123456789abcde.jpg", "0123456789abcdef0.jpg", "0123456789ABCDEF.jpg",
				"0123456789abcdef-depth.gif", "0123456789abcdef/../x.jpg", "..%2f0123456789abcdef.jpg",
				"0123456789abcdef.jpg\n", "0123456789abcdeg.jpg", "0123456789abcdef-Depth.png", "tmp-1.part"};
		for (String name : bad) {
			assertThat(ArtifactStore.isValidName(name)).as(name).isFalse();
		}
		assertThat(ArtifactStore.isValidName(null)).isFalse();
	}

	@Test
	void resolveNeverEscapesTheDirectoryEvenWhenOutsideFileExists() throws IOException {
		Path store = Files.createDirectory(dir.resolve("store"));
		Files.writeString(dir.resolve("0123456789abcdef.jpg"), "dışarıda");
		ArtifactStore artifacts = new ArtifactStore(store, 10, 1_000_000);

		assertThat(artifacts.resolve("../0123456789abcdef.jpg")).isEmpty();
		assertThat(artifacts.resolve("0123456789abcdef.jpg")).isEmpty();
	}

	@Test
	void savesImageUnderContentDigestAndDepthNextToIt() throws IOException {
		ArtifactStore artifacts = new ArtifactStore(dir.resolve("a"), 10, 1_000_000);
		byte[] image = {1, 2, 3, 4};

		String name = artifacts.saveImage(image, "jpg");
		String depth = artifacts.saveDepth(name, new byte[] {9, 9});

		assertThat(name).matches("[a-f0-9]{16}\\.jpg").isEqualTo(ArtifactStore.digestPrefix(image) + ".jpg");
		assertThat(depth).isEqualTo(name.substring(0, 16) + "-depth.png");
		assertThat(artifacts.resolve(name)).isPresent();
		assertThat(Files.readAllBytes(artifacts.resolve(depth).orElseThrow())).containsExactly(9, 9);
		assertThat(artifacts.saveImage(image, "jpg")).isEqualTo(name);
		assertThat(artifacts.exists(name)).isTrue();
		assertThat(artifacts.exists("ffffffffffffffff.jpg")).isFalse();
	}

	@Test
	void saveDepthRejectsInvalidImageName() {
		ArtifactStore artifacts = new ArtifactStore(dir, 10, 1_000_000);
		assertThatThrownBy(() -> artifacts.saveDepth("../x", new byte[1])).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void removesOldestFilesWhenFileCountLimitIsExceeded() throws IOException {
		ArtifactStore artifacts = new ArtifactStore(dir, 3, 1_000_000);
		String[] names = new String[5];
		for (int i = 0; i < 5; i++) {
			names[i] = artifacts.saveImage(new byte[] {(byte) i, 7}, "jpg");
			Files.setLastModifiedTime(dir.resolve(names[i]), FileTime.from(Instant.parse("2026-01-01T00:00:00Z").plusSeconds(i)));
		}

		assertThat(artifacts.exists(names[4])).isTrue();
		assertThat(artifacts.exists(names[3])).isTrue();
		assertThat(artifacts.exists(names[0])).isFalse();
		assertThat(artifacts.exists(names[1])).isFalse();
		try (var files = Files.list(dir)) {
			assertThat(files.count()).isLessThanOrEqualTo(3);
		}
	}

	@Test
	void removesOldestFilesWhenTotalBytesLimitIsExceeded() throws IOException {
		ArtifactStore artifacts = new ArtifactStore(dir, 100, 25);
		String first = artifacts.saveImage(new byte[10], "jpg");
		Files.setLastModifiedTime(dir.resolve(first), FileTime.from(Instant.parse("2026-01-01T00:00:00Z")));
		byte[] b = new byte[10];
		b[0] = 1;
		String second = artifacts.saveImage(b, "jpg");
		Files.setLastModifiedTime(dir.resolve(second), FileTime.from(Instant.parse("2026-01-01T00:00:10Z")));
		byte[] c = new byte[10];
		c[0] = 2;
		String third = artifacts.saveImage(c, "jpg");

		assertThat(artifacts.exists(first)).isFalse();
		assertThat(artifacts.exists(second)).isTrue();
		assertThat(artifacts.exists(third)).isTrue();
	}

	@Test
	void justWrittenFileSurvivesEvenIfItAloneExceedsTheByteLimit() {
		ArtifactStore artifacts = new ArtifactStore(dir, 100, 5);
		String name = artifacts.saveImage(new byte[50], "png");
		assertThat(artifacts.exists(name)).isTrue();
	}

	@Test
	void leavesNoTemporaryFilesBehind() throws IOException {
		ArtifactStore artifacts = new ArtifactStore(dir, 10, 1_000_000);
		artifacts.saveImage(new byte[] {5}, "png");
		try (var files = Files.list(dir)) {
			assertThat(files.map(p -> p.getFileName().toString())).allMatch(ArtifactStore::isValidName);
		}
	}

	@Test
	void staleTempFilesAreRemovedAtStartup() throws IOException {
		Files.writeString(dir.resolve("tmp-123.part"), "yarım");
		String keep = ArtifactStore.digestPrefix(new byte[] {1}) + ".jpg";
		Files.writeString(dir.resolve(keep), "x");

		new ArtifactStore(dir, 10, 1_000_000);

		assertThat(dir.resolve("tmp-123.part")).doesNotExist();
		assertThat(dir.resolve(keep)).exists();
	}
}
