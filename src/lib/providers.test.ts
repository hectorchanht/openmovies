import { describe, expect, it } from 'vitest';
import { PROVIDERS, downloadOptions, parseProgressMessage, providerById, providerMarker } from './providers';

describe('provider registry', () => {
	it('builds VidLink movie and tv URLs from TMDB ids', () => {
		const p = providerById('vidlink');
		expect(p.build({ id: 27205, type: 'movie' })).toContain('https://vidlink.pro/movie/27205');
		expect(p.build({ id: 1396, type: 'tv', season: 2, episode: 3 })).toContain('https://vidlink.pro/tv/1396/2/3');
	});
	it('builds VidFast URLs from TMDB ids', () => {
		expect(providerById('vidfast').build({ id: 155, type: 'movie' })).toBe('https://vidfast.pro/movie/155');
		expect(providerById('vidfast').build({ id: 1396, type: 'tv', season: 1, episode: 2 })).toBe(
			'https://vidfast.pro/tv/1396/1/2'
		);
	});
	it('has at least 2 real providers plus the demo fallback, demo FIRST (P0 default, 2026-11-20)', () => {
		expect(PROVIDERS.length).toBeGreaterThanOrEqual(3);
		expect(PROVIDERS[0].id).toBe('demo');
		expect(PROVIDERS[0].label).toContain('Server 1');
	});
	it('demoted ad-funded providers carry honest ads-when-unsandboxed labels and notes', () => {
		for (const id of ['vidlink', 'vidfast']) {
			const p = providerById(id);
			expect(p.label).toMatch(/ads when unsandboxed/i);
			expect(p.note).toMatch(/sandbox/i);
		}
		expect(providerById('demo').note).toBeUndefined();
	});
	it('never points at the dead VidSrc / VidKing hosts (removed 2026-11-18, both NXDOMAIN)', () => {
		for (const p of PROVIDERS) {
			const urls = [p.build({ id: 1, type: 'movie' }), p.buildDownload?.({ id: 1, type: 'movie' }) ?? ''];
			for (const u of urls) {
				expect(u).not.toContain('vidsrc');
				expect(u).not.toContain('vidking');
			}
		}
		expect(providerById('vidsrc').id).toBe(PROVIDERS[0].id); // unknown ids fall back, never a dead host
		expect(providerById('vidking').id).toBe(PROVIDERS[0].id);
	});
	it('unknown provider id falls back to the first provider', () => {
		expect(providerById('nope').id).toBe(PROVIDERS[0].id);
	});
});

describe('VidLink progress events', () => {
	it('parses a well-formed PLAYER_EVENT', () => {
		const s = parseProgressMessage({ type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime: 3661, duration: 5400 } });
		expect(s).toEqual({ event: 'timeupdate', currentTime: 3661, duration: 5400 });
	});
	it('rejects junk, wrong types and zero duration', () => {
		expect(parseProgressMessage(null)).toBeNull();
		expect(parseProgressMessage('x')).toBeNull();
		expect(parseProgressMessage({ type: 'OTHER', data: { currentTime: 1, duration: 2 } })).toBeNull();
		expect(parseProgressMessage({ type: 'PLAYER_EVENT', data: { currentTime: 1, duration: 0 } })).toBeNull();
		expect(parseProgressMessage({ type: 'PLAYER_EVENT', data: { currentTime: '1', duration: 2 } })).toBeNull();
	});
});

describe('download capability', () => {
	it('every provider declares capabilities; download needs a builder', () => {
		for (const p of PROVIDERS) {
			expect(p.capabilities.length).toBeGreaterThan(0);
			if (p.capabilities.includes('download')) expect(typeof p.buildDownload).toBe('function');
		}
	});
	it('offers no downloads while no live provider supports them (VidSrc died 2026-11-18)', () => {
		// Honest empty state: the UI hides its download buttons on an empty
		// list rather than linking to the NXDOMAIN dl.vidsrc.vip.
		expect(downloadOptions({ id: 27205, type: 'movie' })).toEqual([]);
		expect(downloadOptions({ id: 1396, type: 'tv', season: 2, episode: 3 })).toEqual([]);
	});
	it('stream-only providers never appear as download options', () => {
		const ids = downloadOptions({ id: 1, type: 'movie' }).map((o) => o.provider.id);
		expect(ids).not.toContain('vidlink');
		expect(ids).not.toContain('demo');
	});
});

describe('provider chip marker (edge-probe semantics)', () => {
	it('a verified, edge-confirmed provider gets no marker', () => {
		expect(providerMarker({ id: 'vidlink', verified: true }, [])).toBe('');
	});
	it('an edge-probe failure marks "unverified" — never "down"', () => {
		const m = providerMarker({ id: 'vidlink', verified: true }, ['vidlink']);
		expect(m).toBe(' · unverified');
		expect(m).not.toContain('down');
	});
	it('a provider we never verified is marked even when the probe confirms it', () => {
		expect(providerMarker({ id: 'newhost', verified: false }, [])).toBe(' · unverified');
	});
	it('the demo player never gets a marker', () => {
		expect(providerMarker({ id: 'demo', verified: true }, ['demo'])).toBe('');
	});
});
