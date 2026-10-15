package com.timeportal.scene;

/** İstemcinin gönderdiği sahne isteği geçersiz. 400 olarak döner. */
public class InvalidSceneRequestException extends RuntimeException {

	public InvalidSceneRequestException(String message) {
		super(message);
	}
}
