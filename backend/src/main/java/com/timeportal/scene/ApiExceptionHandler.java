package com.timeportal.scene;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Sahne uçlarındaki tüm hatalar API.md'deki {@code {"error": "..."}} gövdesiyle döner. */
@RestControllerAdvice(basePackageClasses = SceneController.class)
class ApiExceptionHandler {

	@ExceptionHandler(InvalidSceneRequestException.class)
	@ResponseStatus(HttpStatus.BAD_REQUEST)
	Map<String, String> invalid(InvalidSceneRequestException e) {
		return Map.of("error", e.getMessage());
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	@ResponseStatus(HttpStatus.BAD_REQUEST)
	Map<String, String> unreadable(HttpMessageNotReadableException e) {
		return Map.of("error", "request body is missing or not valid JSON");
	}

	@ExceptionHandler(SceneNotFoundException.class)
	@ResponseStatus(HttpStatus.NOT_FOUND)
	Map<String, String> notFound(SceneNotFoundException e) {
		return Map.of("error", e.getMessage());
	}
}
