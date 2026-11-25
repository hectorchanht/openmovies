/**
 * Source-speed transparency (Hector 2026-11-24): every provider/source
 * shows the user its connection speed and playback speed, so the user
 * can pick the fastest/best source themselves. Two honest signals:
 *
 *  1. Edge latency — the Worker's /providers/health probe already
 *     measures how long each provider host took to answer from
 *     Cloudflare's network (latencyMs). It is a connection-speed
 *     signal, labelled as such; it is NOT the user's own device speed.
 *  2. Device time-to-play — measured on the user's own device: from
 *     the moment a provider's embed starts loading to the first
 *     playback progress event the player reports. This is the number
 *     that actually predicts their experience, so once it exists for
 *     a provider it is the headline number on that provider's chip.
 *
 * Everything here is pure or takes its storage/clock as parameters
 * (same pattern as resolve.ts) so it is unit-testable in node.
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

/**
 * The speed suffix on a provider chip. Device time-to-play wins when
 * it exists (it is the user's real experience); otherwise the edge
 * connection latency; otherwise nothing (demo, or nothing measured).
 */
export function chipSpeedLabel(
	providerId: string,
	health: readonly HealthLike[],
	measurements: PlayMeasurements
): string {
	if (providerId === 'demo') return '';
	const m = measurements[providerId];
	if (m?.playMs) return ` · ${formatMs(m.playMs)} 開播`;
	const h = health.find((x) => x.id === providerId);
	if (h?.ok && h.latencyMs > 0) return ` · ${formatMs(h.latencyMs)}`;
	return '';
}
