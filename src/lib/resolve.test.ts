import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearSessionMemo,
	memoKey,
	readMemo,
	resolveSource,
	writeMemo,
	RESOLVE_MEMO_TTL_MS,
	type MemoStorage
} from './resolve';

class FakeStorage implements MemoStorage {
	map = new Map<string, string>();
	getItem(k: string) {
		return this.map.get(k) ?? null;
	}
	setItem(k: string, v: string) {
		this.map.set(k, v);
	}
}

const NOW = 1_800_000_000_000;
const payload = {
	provider: 'vidlink',
	embedUrl: 'https://vidlink.pro/movie/27205?primaryColor=e8590c',
	downloadUrl: null,
	progressEvents: true,
	verified: true
};

beforeEach(() => clearSessionMemo());

describe('memo layer', () => {
	it('keys are stable per target and distinct across episode/provider', () => {
		expect(memoKey('vidlink', { id: 1, type: 'movie' })).toBe(memoKey('vidlink', { id: 1, type: 'movie' }));
		expect(memoKey('vidlink', { id: 1, type: 'tv', season: 1, episode: 2 })).not.toBe(
			memoKey('vidlink', { id: 1, type: 'tv', season: 1, episode: 3 })
		);
		expect(memoKey('vidsrc', { id: 1, type: 'movie' })).not.toBe(memoKey('vidlink', { id: 1, type: 'movie' }));
	});

	it('persists to storage and expires on the TTL', () => {
		const storage = new FakeStorage();
		const key = memoKey('vidlink', { id: 27205, type: 'movie' });
		writeMemo(key, payload, NOW, RESOLVE_MEMO_TTL_MS, storage);
		expect(storage.map.size).toBe(1);
		clearSessionMemo(); // force the localStorage read path
		expect(readMemo(key, NOW + 1000, storage)?.embedUrl).toBe(payload.embedUrl);
		expect(readMemo(key, NOW + RESOLVE_MEMO_TTL_MS + 1, storage)).toBeNull();
	});
});

describe('resolveSource', () => {
	it('uses the Worker /resolve once, then serves from memo', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
		const opts = { apiBase: 'https://api.test', fetchFn: fetchMock as unknown as typeof fetch, now: NOW, storage: new FakeStorage() };
		const r1 = await resolveSource('vidlink', { id: 27205, type: 'movie' }, opts);
		expect(r1.fromCache).toBe(false);
		expect(r1.embedUrl).toBe(payload.embedUrl);
		const r2 = await resolveSource('vidlink', { id: 27205, type: 'movie' }, opts);
		expect(r2.fromCache).toBe(true);
		expect(fetchMock.mock.calls.length).toBe(1);
	});

	it('falls back to the local registry when the API fails — watching never depends on it', async () => {
		const fetchFn = vi.fn(async () => {
			throw new Error('api down');
		}) as unknown as typeof fetch;
		const r = await resolveSource(
			'vidsrc',
			{ id: 1396, type: 'tv', season: 2, episode: 3 },
			{ apiBase: 'https://api.test', fetchFn, now: NOW, storage: new FakeStorage() }
		);
		expect(r.embedUrl).toBe('https://vidsrc.icu/embed/tv/1396/2/3');
		expect(r.downloadUrl).toBe('https://dl.vidsrc.vip/tv/1396/2/3');
	});

	it('with no API configured, resolves locally with zero fetches', async () => {
		const fetchFn = vi.fn() as unknown as typeof fetch;
		const r = await resolveSource('vidking', { id: 603, type: 'movie' }, { apiBase: '', fetchFn, now: NOW, storage: new FakeStorage() });
		expect(r.embedUrl).toContain('vidking.net/embed/movie/603');
		expect(fetchFn).not.toHaveBeenCalled();
	});
});
