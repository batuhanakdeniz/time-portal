package com.timeportal.scene;

/** İstenen sahne işi yok. 404 olarak döner. */
public class SceneNotFoundException extends RuntimeException {

	public SceneNotFoundException(String id) {
		super("scene not found: " + id);
	}
}
