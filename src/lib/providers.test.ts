import { describe, expect, it } from 'vitest';
import {
	FAILOVER_TIMEOUT_MS,
	PROVIDERS,
	downloadOptions,
	failoverRotation,
	nextFailoverProvider,
	parseProgressMessage,
	providerById,
	providerMarker
} from './providers';

describe('provider registry', () => {
	it('builds VidLink movie and tv URLs from TMDB ids', () => {
		const p = providerById('vidlink');
		expect(p.build({ id: 27205, type: 'movie' })).toContain('https://vidlink.pro/movie/27205');
		expect(p.build({ id: 1396, type: 'tv', season: 2, episode: 3 })).toContain('https://vidlink.pro/tv/1396/2/3');
	});
	it('builds EmbedWave URLs from TMDB ids (patterns from embedwave.cc/docs)', () => {
		expect(providerById('embedwave').build({ id: 577922, type: 'movie' })).toBe(
			'https://embedwave.cc/embed/movie/577922'
		);
		expect(providerById('embedwave').build({ id: 1399, type: 'tv', season: 1, episode: 1 })).toBe(
			'https://embedwave.cc/embed/tv/1399/1/1'
		);
		expect(providerById('embedwave').build({ id: 1396, type: 'tv', season: 2, episode: 3 })).toBe(
			'https://embedwave.cc/embed/tv/1396/2/3'
		);
	});
	it('builds VidFast URLs from TMDB ids on the moved .vc domain (2026-11-24)', () => {
		expect(providerById('vidfast').build({ id: 155, type: 'movie' })).toBe('https://vidfast.vc/movie/155');
		expect(providerById('vidfast').build({ id: 1396, type: 'tv', season: 1, episode: 2 })).toBe(
			'https://vidfast.vc/tv/1396/1/2'
		);
		for (const p of PROVIDERS) {
			expect(p.build({ id: 1, type: 'movie' })).not.toContain('vidfast.pro');
		}
	});
	it('builds BingeAPI URLs from TMDB ids (bingeapi.st embed patterns)', () => {
		expect(providerById('bingeapi').build({ id: 577922, type: 'movie' })).toBe(
			'https://bingeapi.st/embed/movie/577922'
		);
		expect(providerById('bingeapi').build({ id: 1396, type: 'tv', season: 2, episode: 3 })).toBe(
			'https://bingeapi.st/embed/tv/1396/2/3'
		);
	});
	it('has EmbedWave FIRST as Server 1 (verified sandbox-clean default, 2026-11-20), BingeAPI second (2026-11-24)', () => {
		expect(PROVIDERS.length).toBeGreaterThanOrEqual(5);
		expect(PROVIDERS[0].id).toBe('embedwave');
		expect(PROVIDERS[0].label).toContain('Server 1');
		expect(PROVIDERS[0].label).toContain('EmbedWave');
		expect(PROVIDERS[1].id).toBe('bingeapi');
		expect(PROVIDERS[1].label).toContain('Server 2');
		expect(providerById('demo').label).toContain('Server 3');
		expect(providerById('vidlink').label).toContain('Server 4');
		expect(providerById('vidfast').label).toContain('Server 5');
	});
	it('BingeAPI is honestly labelled: auto-switch claim on the chip, NOT verified, never ad-tagged', () => {
		const p = providerById('bingeapi');
		expect(p.label).toContain('BingeAPI');
		expect(p.label).toContain('12 servers auto-switch');
		expect(p.label).not.toContain('有廣告');
		expect(p.verified).toBe(false);
		expect(p.adSupported).toBe(false);
		// unverified => the chip marker says so (never "down", never silent)
		expect(providerMarker(p, [])).toBe(' · unverified');
	});
	it('ad-funded providers carry the 有廣告 tag on their chip label and an honest note', () => {
		for (const id of ['vidlink', 'vidfast']) {
			const p = providerById(id);
			expect(p.label).toContain('有廣告');
			expect(p.label).toMatch(/\bAds\b/);
			expect(p.note).toMatch(/unsandboxed/i);
			expect(p.note).toMatch(/earn nothing/i);
		}
		expect(providerById('demo').label).not.toContain('有廣告');
		expect(providerById('demo').note).toBeUndefined();
		expect(providerById('embedwave').label).not.toContain('有廣告');
	});
	it('flags ad-supported providers explicitly; clean providers are never ad-supported', () => {
		// Ad Mode may only unsandbox a provider whose adSupported flag is
		// true — the flag is the registry half of that gate (Player.svelte
		// holds the other half), so every provider must declare it.
		for (const p of PROVIDERS) expect(typeof p.adSupported).toBe('boolean');
		expect(providerById('vidlink').adSupported).toBe(true);
		expect(providerById('vidfast').adSupported).toBe(true);
		expect(providerById('demo').adSupported).toBe(false);
		expect(providerById('embedwave').adSupported).toBe(false);
		expect(providerById('bingeapi').adSupported).toBe(false);
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

describe('automatic failover rotation (2026-11-24)', () => {
	it('has a bounded, generous timeout', () => {
		expect(FAILOVER_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
		expect(FAILOVER_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
	});
	it('never auto-advances into the simulated Demo Player', () => {
		expect(failoverRotation(false).map((p) => p.id)).not.toContain('demo');
		expect(failoverRotation(true).map((p) => p.id)).not.toContain('demo');
	});
	it('keeps ad-supported servers OUT of the rotation until Ad Mode is on (consent)', () => {
		expect(failoverRotation(false).map((p) => p.id)).toEqual(['embedwave', 'bingeapi']);
		expect(failoverRotation(true).map((p) => p.id)).toEqual(['embedwave', 'bingeapi', 'vidlink', 'vidfast']);
	});
	it('advances in registry order from the current server', () => {
		expect(nextFailoverProvider('embedwave', [], { adMode: false })?.id).toBe('bingeapi');
		expect(nextFailoverProvider('embedwave', [], { adMode: true })?.id).toBe('bingeapi');
		expect(nextFailoverProvider('bingeapi', [], { adMode: true })?.id).toBe('vidlink');
	});
	it('skips servers already tried and never returns the current one', () => {
		expect(nextFailoverProvider('embedwave', ['bingeapi'], { adMode: true })?.id).toBe('vidlink');
		expect(nextFailoverProvider('vidlink', ['embedwave', 'bingeapi'], { adMode: true })?.id).toBe('vidfast');
	});
	it('wraps once, then gives up (null) when everything was tried', () => {
		expect(nextFailoverProvider('vidfast', [], { adMode: true })?.id).toBe('embedwave');
		expect(nextFailoverProvider('embedwave', ['bingeapi'], { adMode: false })).toBeNull();
		expect(nextFailoverProvider('vidfast', ['embedwave', 'bingeapi', 'vidlink'], { adMode: true })).toBeNull();
	});
	it('with Ad Mode off, exhausting the clean servers ends the chain (no silent ad opt-in)', () => {
		expect(nextFailoverProvider('bingeapi', ['embedwave'], { adMode: false })).toBeNull();
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
		expect(ids).not.toContain('embedwave');
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
