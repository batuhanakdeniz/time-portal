package com.timeportal.scene;

import java.time.Instant;

/**
 * Bir üretim işinin değişmez anlık görüntüsü. Durum geçişleri yalnızca bu sınıftadır:
 * {@code PENDING → RUNNING → READY | FAILED}.
 */
public record SceneJob(
		String id,
		SceneRequest request,
		SceneStatus status,
		SceneResult result,
		String error,
		Instant createdAt) {

	public static SceneJob pending(String id, SceneRequest request, Instant createdAt) {
		return new SceneJob(id, request, SceneStatus.PENDING, null, null, createdAt);
	}

	public SceneJob running() {
		requireStatus(SceneStatus.PENDING, SceneStatus.RUNNING);
		return new SceneJob(id, request, SceneStatus.RUNNING, null, null, createdAt);
	}

	public SceneJob ready(SceneResult sceneResult) {
		requireStatus(SceneStatus.RUNNING, SceneStatus.READY);
		return new SceneJob(id, request, SceneStatus.READY, sceneResult, null, createdAt);
	}

	public SceneJob failed(String message) {
		requireStatus(SceneStatus.RUNNING, SceneStatus.FAILED);
		return new SceneJob(id, request, SceneStatus.FAILED, null, message, createdAt);
	}

	private void requireStatus(SceneStatus expected, SceneStatus target) {
		if (status != expected) {
			throw new IllegalStateException("cannot move job %s from %s to %s".formatted(id, status, target));
		}
	}
}
