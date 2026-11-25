import { describe, expect, it } from 'vitest';
import {
	chipSpeedLabel,
	connectionTier,
	fastestProviderId,
	formatMs,
	playTier,
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
		expect(chipSpeedLabel('vidlink', [], {})).toBe('');
	});
});
