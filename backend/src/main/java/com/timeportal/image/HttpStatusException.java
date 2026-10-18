package com.timeportal.image;

import java.io.IOException;

/** 2xx olmayan HTTP yanıtı. Mesajda yalnızca durum kodu bulunur; gövde ayrı alandadır. */
public class HttpStatusException extends IOException {

	private final int status;
	private final String body;

	public HttpStatusException(int status, String body) {
		super("HTTP " + status);
		this.status = status;
		this.body = body == null ? "" : body;
	}

	public int status() {
		return status;
	}

	public String body() {
		return body;
	}
}
