package com.timeportal.scene;

import java.time.Instant;

/**
 * Bir üretim işinin değişmez anlık görüntüsü. Durum geçişleri yalnızca bu sınıftadır:
 * {@code PENDING → RUNNING → READY | FAILED}. {@code finishedAt} yalnızca bitmiş işlerde doludur.
 * {@code stage} yalnızca {@code RUNNING} iken dolu olabilir (üretici ilk aşamayı bildirene kadar
 * {@code null}); diğer durumlarda her zaman {@code null}.
 */
public record SceneJob(
		String id,
		SceneRequest request,
		SceneStatus status,
		SceneResult result,
		String error,
		Instant createdAt,
		Instant finishedAt,
		SceneStage stage) {

	public SceneJob {
		if (stage != null && status != SceneStatus.RUNNING) {
			throw new IllegalArgumentException("stage is only set while RUNNING");
		}
	}

	public static SceneJob pending(String id, SceneRequest request, Instant createdAt) {
		return new SceneJob(id, request, SceneStatus.PENDING, null, null, createdAt, null, null);
	}

	public SceneJob running() {
		requireStatus(SceneStatus.PENDING, SceneStatus.RUNNING);
		return new SceneJob(id, request, SceneStatus.RUNNING, null, null, createdAt, null, null);
	}

	/** Çalışan işin aşamasını değiştirir; iş RUNNING değilse hata. */
	public SceneJob atStage(SceneStage newStage) {
		requireStatus(SceneStatus.RUNNING, SceneStatus.RUNNING);
		return new SceneJob(id, request, SceneStatus.RUNNING, null, null, createdAt, null, newStage);
	}

	public SceneJob ready(SceneResult sceneResult, Instant now) {
		requireStatus(SceneStatus.RUNNING, SceneStatus.READY);
		return new SceneJob(id, request, SceneStatus.READY, sceneResult, null, createdAt, now, null);
	}

	public SceneJob failed(String message, Instant now) {
		requireStatus(SceneStatus.RUNNING, SceneStatus.FAILED);
		return new SceneJob(id, request, SceneStatus.FAILED, null, message, createdAt, now, null);
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
