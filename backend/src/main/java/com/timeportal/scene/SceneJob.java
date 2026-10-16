package com.timeportal.scene;

import java.time.Instant;

/**
 * Bir üretim işinin değişmez anlık görüntüsü. Durum geçişleri yalnızca bu sınıftadır:
 * {@code PENDING → RUNNING → READY | FAILED}. {@code finishedAt} yalnızca bitmiş işlerde doludur.
 */
public record SceneJob(
		String id,
		SceneRequest request,
		SceneStatus status,
		SceneResult result,
		String error,
		Instant createdAt,
		Instant finishedAt) {

	public static SceneJob pending(String id, SceneRequest request, Instant createdAt) {
		return new SceneJob(id, request, SceneStatus.PENDING, null, null, createdAt, null);
	}

	public SceneJob running() {
		requireStatus(SceneStatus.PENDING, SceneStatus.RUNNING);
		return new SceneJob(id, request, SceneStatus.RUNNING, null, null, createdAt, null);
	}

	public SceneJob ready(SceneResult sceneResult, Instant now) {
		requireStatus(SceneStatus.RUNNING, SceneStatus.READY);
		return new SceneJob(id, request, SceneStatus.READY, sceneResult, null, createdAt, now);
	}

	public SceneJob failed(String message, Instant now) {
		requireStatus(SceneStatus.RUNNING, SceneStatus.FAILED);
		return new SceneJob(id, request, SceneStatus.FAILED, null, message, createdAt, now);
	}

	/** READY ya da FAILED mi? Yalnızca bitmiş işler TTL ile silinebilir. */
	public boolean isFinished() {
		return status == SceneStatus.READY || status == SceneStatus.FAILED;
	}

	private void requireStatus(SceneStatus expected, SceneStatus target) {
		if (status != expected) {
			throw new IllegalStateException("cannot move job %s from %s to %s".formatted(id, status, target));
		}
	}
}
