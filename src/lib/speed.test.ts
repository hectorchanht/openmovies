import { describe, expect, it } from 'vitest';
import {
	chipSpeedLabel,
	connectionTier,
	deviceProbesToHealth,
	fastestProviderId,
	formatMs,
	playTier,
	probeDeviceLatency,
	readMeasurements,
	recordMeasurement,
	type SpeedStorage
} from './speed';

const mem = (): SpeedStorage & { store: Map<string, string> } => {
	const store = new Map<string, string>();
	return {
		store,
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => void store.set(k, v)
	};
};

describe('speed tiers', () => {
	it('grades connection latency and time-to-play on their own scales', () => {
		expect(connectionTier(120)).toBe('fast');
		expect(connectionTier(800)).toBe('medium');
		expect(connectionTier(2400)).toBe('slow');
		expect(connectionTier(null)).toBe('unknown');
		expect(playTier(1500)).toBe('fast');
		expect(playTier(5000)).toBe('medium');
		expect(playTier(15000)).toBe('slow');
		expect(playTier(0)).toBe('unknown');
	});
	it('formats ms compactly', () => {
		expect(formatMs(238)).toBe('238ms');
		expect(formatMs(1800)).toBe('1.8s');
	});
});

describe('fastest provider (edge latency)', () => {
	const health = [
		{ id: 'bingeapi', ok: true, latencyMs: 210 },
		{ id: 'embedwave', ok: true, latencyMs: 480 },
		{ id: 'demo', ok: true, latencyMs: 0 },
		{ id: 'vidlink', ok: false, latencyMs: 90 },
		{ id: 'vidfast', ok: true, latencyMs: 150 }
	];
	it('picks the lowest confirmed latency, never demo, never an unconfirmed probe', () => {
		expect(fastestProviderId(health)).toBe('vidfast');
	});
	it('returns null when nothing is confirmed', () => {
		expect(fastestProviderId([{ id: 'bingeapi', ok: false, latencyMs: 10 }])).toBeNull();
		expect(fastestProviderId([])).toBeNull();
	});
});

describe('device measurements', () => {
	it('records, merges and persists per-provider samples', () => {
		const s = mem();
		let all = recordMeasurement({}, 'bingeapi', { loadMs: 900 }, 1000, s);
		all = recordMeasurement(all, 'bingeapi', { playMs: 2600 }, 2000, s);
		expect(all.bingeapi).toEqual({ loadMs: 900, playMs: 2600, updatedAt: 2000 });
		expect(readMeasurements(s).bingeapi.playMs).toBe(2600);
	});
	it('chip label prefers the device time-to-play over edge latency', () => {
		const health = [{ id: 'bingeapi', ok: true, latencyMs: 210 }];
		expect(chipSpeedLabel('bingeapi', health, {})).toBe(' · 210ms');
		expect(chipSpeedLabel('bingeapi', health, { bingeapi: { loadMs: 900, playMs: 2600, updatedAt: 1 } })).toBe(
			' · 2.6s 開播'
		);
		expect(chipSpeedLabel('demo', health, {})).toBe('');
	});
	it('an unmeasured provider shows the neutral 未測 state — never a fabricated number (ruling 2)', () => {
		expect(chipSpeedLabel('vidlink', [], {})).toBe(' · 未測');
		expect(chipSpeedLabel('vidlink', [{ id: 'vidlink', ok: false, latencyMs: 90 }], {})).toBe(' · 未測');
		expect(chipSpeedLabel('vidlink', [], {}, { vidlink: null })).toBe(' · 未測');
	});
});

describe('device connection probe (ruling 2 — device-side is primary)', () => {
	it('chip label prefers the DEVICE probe over the edge probe', () => {
		const health = [{ id: 'bingeapi', ok: true, latencyMs: 210 }];
		expect(chipSpeedLabel('bingeapi', health, {}, { bingeapi: 120 })).toBe(' · 120ms');
		// a failed device probe (null) falls back to the edge number
		expect(chipSpeedLabel('bingeapi', health, {}, { bingeapi: null })).toBe(' · 210ms');
		// device time-to-play still outranks both once it exists
		expect(
			chipSpeedLabel('bingeapi', health, { bingeapi: { loadMs: 900, playMs: 2600, updatedAt: 1 } }, { bingeapi: 120 })
		).toBe(' · 2.6s 開播');
	});
	it('probeDeviceLatency times the fetch on the injected clock', async () => {
		const ticks = [1000, 1240];
		const now = () => ticks.shift() ?? 1240;
		const okFetch = async () => ({});
		await expect(probeDeviceLatency('https://bingeapi.st/favicon.ico', okFetch, now)).resolves.toBe(240);
	});
	it('probeDeviceLatency returns null (not measured) when the probe fails or times out', async () => {
		const failFetch = async () => {
			throw new Error('network down');
		};
		await expect(probeDeviceLatency('https://x.example/favicon.ico', failFetch, () => 0)).resolves.toBeNull();
		const hangFetch = () => new Promise(() => {});
		await expect(probeDeviceLatency('https://x.example/favicon.ico', hangFetch, () => 0, 5)).resolves.toBeNull();
	});
	it('deviceProbesToHealth keeps only answered probes — a failed probe is unmeasured, never "down"', () => {
		const rows = deviceProbesToHealth({ bingeapi: 120, embedwave: null, vidlink: 340 });
		expect(rows).toEqual([
			{ id: 'bingeapi', ok: true, latencyMs: 120 },
			{ id: 'vidlink', ok: true, latencyMs: 340 }
		]);
		expect(fastestProviderId(rows)).toBe('bingeapi');
	});
});
