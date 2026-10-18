package com.timeportal.image;

import java.io.IOException;
import java.util.Map;

/** Görsel kaynaklarının kullandığı küçük HTTP GET soyutlaması (testlerde sahtelenir). */
public interface ImageHttp {

	/**
	 * 2xx yanıtın gövdesini döner. Diğer durumlarda ya da ağ hatasında {@link IOException} fırlatır;
	 * mesajda istek başlıkları bulunmamalıdır.
	 */
	String get(String url, Map<String, String> headers) throws IOException;
}
