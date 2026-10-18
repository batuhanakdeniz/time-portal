package com.timeportal.depth;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.FloatBuffer;
import java.util.Map;
import java.util.concurrent.Semaphore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Depth Anything V2 Small (ONNX Runtime, CPU). Oturum ve native kütüphane ilk {@link #estimate}
 * çağrısında yüklenir (uygulama başlangıcında ve testlerde native yüklenmez). Eşzamanlı çıkarım
 * semaforla sınırlıdır. Çıktı göreli ters derinliktir (büyük = yakın), girdi boyutuna büyütülür.
 */
public class OnnxDepthEstimator implements DepthEstimator, AutoCloseable {

	private static final Logger log = LoggerFactory.getLogger(OnnxDepthEstimator.class);

	private final DepthModelStore store;
	private final Semaphore permits;
	private final Object sessionLock = new Object();
	private OrtEnvironment env;
	private OrtSession session;
	private String inputName;
	private volatile long lastInferenceMillis = -1;

	public OnnxDepthEstimator(DepthModelStore store, int maxConcurrent) {
		if (maxConcurrent < 1) {
			throw new IllegalArgumentException("timeportal.depth.max-concurrent must be at least 1");
		}
		this.store = store;
		this.permits = new Semaphore(maxConcurrent);
	}

	/** Son çıkarımın (yalnızca model çalışması, ön/son işlem hariç) süresi ms; hiç çalışmadıysa -1. */
	public long lastInferenceMillis() {
		return lastInferenceMillis;
	}

	@Override
	public DepthMap estimate(BufferedImage image) {
		int[] size = DepthMath.modelInputSize(image.getWidth(), image.getHeight());
		int mw = size[0];
		int mh = size[1];
		BufferedImage resized = DepthPipeline.resize(image, mw, mh);
		int[] rgb = resized.getRGB(0, 0, mw, mh, null, 0, mw);
		float[] input = DepthMath.toNchw(rgb, mw, mh);
		try {
			permits.acquire();
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("depth estimation interrupted", e);
		}
		try {
			OrtSession s = session();
			long start = System.nanoTime();
			try (OnnxTensor tensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(input), new long[] {1, 3, mh, mw});
					OrtSession.Result result = s.run(Map.of(inputName, tensor))) {
				OnnxTensor out = (OnnxTensor) result.get(0);
				long[] shape = out.getInfo().getShape();
				int oh = (int) shape[shape.length - 2];
				int ow = (int) shape[shape.length - 1];
				float[] values = new float[ow * oh];
				out.getFloatBuffer().get(values);
				lastInferenceMillis = (System.nanoTime() - start) / 1_000_000;
				log.info("Depth inference {}x{} took {} ms", mw, mh, lastInferenceMillis);
				return DepthMath.resizeBilinear(new DepthMap(ow, oh, values), image.getWidth(), image.getHeight());
			}
		}
		catch (OrtException | IOException e) {
			throw new IllegalStateException("depth inference failed", e);
		}
		finally {
			permits.release();
		}
	}

	private OrtSession session() throws IOException, OrtException {
		synchronized (sessionLock) {
			if (session == null) {
				var path = store.ensureModel();
				env = OrtEnvironment.getEnvironment();
				session = env.createSession(path.toString(), new OrtSession.SessionOptions());
				inputName = session.getInputNames().iterator().next();
			}
			return session;
		}
	}

	@Override
	public void close() {
		synchronized (sessionLock) {
			if (session != null) {
				try {
					session.close();
				}
				catch (OrtException e) {
					log.warn("Closing ONNX session failed: {}", e.getMessage());
				}
				session = null;
			}
		}
	}
}
