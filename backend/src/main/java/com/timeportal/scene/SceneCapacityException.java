package com.timeportal.scene;

/** Bekleyen + çalışan iş sayısı sınıra ulaştığında fırlatılır; API 503 + Retry-After döner. */
public class SceneCapacityException extends RuntimeException {

	private final int retryAfterSeconds;

	public SceneCapacityException(int retryAfterSeconds) {
		super("too many scenes are being generated, try again shortly");
		this.retryAfterSeconds = retryAfterSeconds;
	}

	public int retryAfterSeconds() {
		return retryAfterSeconds;
	}
}
