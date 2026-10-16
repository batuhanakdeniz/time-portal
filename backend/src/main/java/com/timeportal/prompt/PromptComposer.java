package com.timeportal.prompt;

import com.timeportal.scene.SceneRequest;

/**
 * Tarih ve konumdan görsel modeli için sahne tarifi üretir.
 *
 * <p>Kural tabanlı uygulama {@link RuleBasedPromptComposer}'dır; bir LLM uygulaması ileride aynı
 * arayüzün arkasına takılabilir.
 */
public interface PromptComposer {

	ScenePrompt compose(SceneRequest request);
}
