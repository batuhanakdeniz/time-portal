package com.timeportal.image;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Testlerde gerçek ağ yerine sabit fixture dosyaları döndüren {@link ImageHttp}. */
class FakeHttp implements ImageHttp {

	record Request(String url, Map<String, String> headers) {
	}

	final List<Request> requests = new ArrayList<>();
	private final Function<String, String> responder;

	FakeHttp(Function<String, String> responder) {
		this.responder = responder;
	}

	/** Her isteğe aynı fixture'ı döner. */
	static FakeHttp always(String fixture) {
		String body = fixture(fixture);
		return new FakeHttp(url -> body);
	}

	static FakeHttp failing(String message) {
		return new FakeHttp(url -> {
			throw new FailureSignal(message);
		});
	}

	static String fixture(String name) {
		try (InputStream in = FakeHttp.class.getResourceAsStream("/image/" + name)) {
			if (in == null) {
				throw new IllegalStateException("missing fixture " + name);
			}
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	@Override
	public String get(String url, Map<String, String> headers) throws IOException {
		requests.add(new Request(url, headers));
		try {
			return responder.apply(url);
		}
		catch (FailureSignal f) {
			throw new IOException(f.getMessage());
		}
		catch (StatusSignal st) {
			throw new HttpStatusException(st.status, st.body);
		}
	}

	/** Responder içinden HTTP durum hatası fırlatmak için. */
	static class StatusSignal extends RuntimeException {
		final int status;
		final String body;

		StatusSignal(int status, String body) {
			this.status = status;
			this.body = body;
		}
	}

	private static class FailureSignal extends RuntimeException {
		FailureSignal(String m) {
			super(m);
		}
	}
}
