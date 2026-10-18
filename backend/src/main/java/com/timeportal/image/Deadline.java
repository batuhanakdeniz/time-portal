package com.timeportal.image;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/** Zincirin toplam süre bütçesi. {@link #none()} süresizdir. */
public final class Deadline {

	private static final Deadline NONE = new Deadline(null, null);

	private final Clock clock;
	private final Instant at;

	private Deadline(Clock clock, Instant at) {
		this.clock = clock;
		this.at = at;
	}

	public static Deadline none() {
		return NONE;
	}

	public static Deadline after(Clock clock, Duration budget) {
		return new Deadline(clock, clock.instant().plus(budget));
	}

	public boolean expired() {
		return at != null && !clock.instant().isBefore(at);
	}
}
