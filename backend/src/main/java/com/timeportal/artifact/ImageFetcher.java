package com.timeportal.artifact;

import java.io.IOException;

/** Uzak bir görsel adresini indirip doğrulayan soyutlama (testlerde sahtelenir). */
@FunctionalInterface
public interface ImageFetcher {

	/** @throws IOException indirme ya da doğrulama (https, boyut, MIME, çözülebilirlik) başarısızsa */
	FetchedImage fetch(String url) throws IOException;
}
