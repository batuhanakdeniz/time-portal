package com.timeportal.image;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/** Zincirin toplam süre bütçesi. {@link #none()} süresizdir. */
public final class Deadline {

	private final java.util.concurrent.atomic.AtomicBoolean degraded = new java.util.concurrent.atomic.AtomicBoolean();
	private final Clock clock;
	private final Instant at;

	private Deadline(Clock clock, Instant at) {
		this.clock = clock;
		this.at = at;
	}

	public static Deadline none() {
		return new Deadline(null, null);
	}

	public static Deadline after(Clock clock, Duration budget) {
		return new Deadline(clock, clock.instant().plus(budget));
	}

	/** Kaynak, aramayı yarıda bıraktığını ya da hatayı yutup kısmi sonuç döndüğünü bildirir. */
	public void markDegraded() {
		degraded.set(true);
	}

	public boolean degraded() {
		return degraded.get();
	}

	public boolean expired() {
		return at != null && !clock.instant().isBefore(at);
	}
}
