/**
 * Source-speed transparency (Hector 2026-11-24): every provider/source
 * shows the user its connection speed and playback speed, so the user
 * can pick the fastest/best source themselves. Honest signals, in the
 * order the UI prefers them:
 *
 *  1. Device time-to-play — measured on the user's own device: from
 *     the moment a provider's embed starts loading to the first
 *     playback progress event the player reports. This is the number
 *     that actually predicts their experience, so once it exists for
 *     a provider it is the headline number on that provider's chip.
 *  2. Device connection probe — ALSO measured on the user's device
 *     (probeDeviceLatency: a no-cors fetch of the provider origin's
 *     favicon at page load). It reflects the user's real network path,
 *     so it is the primary connection number.
 *  3. Edge latency — the Worker's /providers/health probe measures
 *     how long each provider host took to answer from Cloudflare's
 *     network (latencyMs). A fallback connection signal for when the
 *     device probe could not run, labelled as the edge's number.
 *
 * A provider with NO measurement yet shows a neutral 未測 state —
 * never a fabricated number.
 *
 * Everything here is pure or takes its storage/clock/fetch as
 * parameters (same pattern as resolve.ts) so it is unit-testable in
 * node.
 */

export type SpeedTier = 'fast' | 'medium' | 'slow' | 'unknown';

/** Tier thresholds for an edge connection probe (host root answer). */
export function connectionTier(latencyMs: number | null | undefined): SpeedTier {
	if (latencyMs === null || latencyMs === undefined || !Number.isFinite(latencyMs) || latencyMs < 0) return 'unknown';
	if (latencyMs < 400) return 'fast';
	if (latencyMs < 1200) return 'medium';
	return 'slow';
}

/** Tier thresholds for device time-to-play (embed load -> first progress). */
export function playTier(ms: number | null | undefined): SpeedTier {
	if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return 'unknown';
	if (ms < 3000) return 'fast';
	if (ms < 8000) return 'medium';
	return 'slow';
}

export const TIER_LABEL: Record<SpeedTier, string> = {
	fast: '快 Fast',
	medium: '普通 OK',
	slow: '慢 Slow',
	unknown: '未測 Not measured'
};

/** "238ms" under a second, "1.8s" above it — the chip/panel format. */
export function formatMs(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '—';
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export interface HealthLike {
	id: string;
	ok: boolean;
	latencyMs: number;
}

/**
 * The fastest provider by edge latency: the lowest latencyMs among
 * providers the probe actually confirmed (ok), excluding the demo
 * player (it is ours, its 0ms would always "win" and means nothing).
 * Returns null when nothing was confirmed — no badge is shown then,
 * rather than a guessed one.
 */
export function fastestProviderId(health: readonly HealthLike[]): string | null {
	let best: HealthLike | null = null;
	for (const h of health) {
		if (!h.ok || h.id === 'demo' || !(h.latencyMs > 0)) continue;
		if (!best || h.latencyMs < best.latencyMs) best = h;
	}
	return best?.id ?? null;
}

/** One device-measured playback sample for a provider. */
export interface PlayMeasurement {
	/** ms from embed load start to the iframe's load event. */
	loadMs: number | null;
	/** ms from embed load start to the first progress/play event. */
	playMs: number | null;
	updatedAt: number;
}

export type PlayMeasurements = Record<string, PlayMeasurement>;

const LS_KEY = 'om_provider_speed:v1';

export interface SpeedStorage {
	getItem(k: string): string | null;
	setItem(k: string, v: string): void;
}

function defaultStorage(): SpeedStorage | null {
	try {
		return typeof localStorage !== 'undefined' ? localStorage : null;
	} catch {
		return null;
	}
}

export function readMeasurements(storage: SpeedStorage | null = defaultStorage()): PlayMeasurements {
	if (!storage) return {};
	try {
		const raw = storage.getItem(LS_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as PlayMeasurements;
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}

/** Merge one sample into the stored measurements (best-effort persist). */
export function recordMeasurement(
	all: PlayMeasurements,
	providerId: string,
	patch: Partial<Omit<PlayMeasurement, 'updatedAt'>>,
	now: number,
	storage: SpeedStorage | null = defaultStorage()
): PlayMeasurements {
	const prev = all[providerId];
	const next: PlayMeasurements = {
		...all,
		[providerId]: {
			loadMs: patch.loadMs !== undefined ? patch.loadMs : (prev?.loadMs ?? null),
			playMs: patch.playMs !== undefined ? patch.playMs : (prev?.playMs ?? null),
			updatedAt: now
		}
	};
	if (storage) {
		try {
			storage.setItem(LS_KEY, JSON.stringify(next));
		} catch {
			/* persistence is an optimisation, never a requirement */
		}
	}
	return next;
}

/** Upper bound for one device probe; a slower answer counts as unmeasured. */
export const DEVICE_PROBE_TIMEOUT_MS = 8_000;

/**
 * Measure one provider origin's response time ON THIS DEVICE: a
 * no-cors fetch (we cannot read the response cross-origin, and do not
 * need to — the elapsed time is the measurement). Resolves to the
 * elapsed ms, or null when the probe failed or timed out — null means
 * "not measured", never "down" (the same doctrine as the edge probe).
 * fetch + clock are injected for tests.
 */
export async function probeDeviceLatency(
	url: string,
	fetchFn: (u: string, init: { mode: 'no-cors'; cache: 'no-store' }) => Promise<unknown>,
	now: () => number = () => performance.now(),
	timeoutMs: number = DEVICE_PROBE_TIMEOUT_MS
): Promise<number | null> {
	const start = now();
	try {
		await Promise.race([
			fetchFn(url, { mode: 'no-cors', cache: 'no-store' }),
			new Promise((_, reject) => setTimeout(() => reject(new Error('device probe timeout')), timeoutMs))
		]);
	} catch {
		return null;
	}
	const ms = now() - start;
	return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * Shape device-probe results as HealthLike rows for fastestProviderId.
 * Failed probes (null) are EXCLUDED, not marked ok:false — on the
 * device as at the edge, an unanswered probe is "not measured", never
 * evidence a server is down.
 */
export function deviceProbesToHealth(probes: Record<string, number | null>): HealthLike[] {
	return Object.entries(probes)
		.filter(([, ms]) => typeof ms === 'number')
		.map(([id, ms]) => ({ id, ok: true, latencyMs: ms as number }));
}

/**
 * The speed suffix on a provider chip. Device time-to-play wins when
 * it exists (it is the user's real experience); otherwise the device
 * connection probe (the user's real network path); otherwise the edge
 * connection latency; otherwise the neutral 未測 state — a provider
 * whose speed has not been measured yet says so, never a made-up
 * number (Hector 2026-11-24: speed is displayed, never hidden).
 */
export function chipSpeedLabel(
	providerId: string,
	health: readonly HealthLike[],
	measurements: PlayMeasurements,
	deviceProbes: Record<string, number | null> = {}
): string {
	if (providerId === 'demo') return '';
	const m = measurements[providerId];
	if (m?.playMs) return ` · ${formatMs(m.playMs)} 開播`;
	const dp = deviceProbes[providerId];
	if (typeof dp === 'number' && dp > 0) return ` · ${formatMs(dp)}`;
	const h = health.find((x) => x.id === providerId);
	if (h?.ok && h.latencyMs > 0) return ` · ${formatMs(h.latencyMs)}`;
	return ' · 未測';
}
