import { describe, expect, it } from 'vitest';
import { PROVIDERS, downloadOptions, parseProgressMessage, providerById } from './providers';

describe('provider registry', () => {
	it('builds VidLink movie and tv URLs from TMDB ids', () => {
		const p = providerById('vidlink');
		expect(p.build({ id: 27205, type: 'movie' })).toContain('https://vidlink.pro/movie/27205');
		expect(p.build({ id: 1396, type: 'tv', season: 2, episode: 3 })).toContain('https://vidlink.pro/tv/1396/2/3');
	});
	it('builds VidSrc and VidKing URLs', () => {
		expect(providerById('vidsrc').build({ id: 155, type: 'movie' })).toBe('https://vidsrc.icu/embed/movie/155');
		expect(providerById('vidsrc').build({ id: 1399, type: 'tv', season: 1, episode: 2 })).toBe(
			'https://vidsrc.icu/embed/tv/1399/1/2'
		);
		expect(providerById('vidking').build({ id: 155, type: 'movie' })).toContain('vidking.net/embed/movie/155');
	});
	it('has at least 3 real providers plus the demo fallback, demo last', () => {
		expect(PROVIDERS.length).toBeGreaterThanOrEqual(4);
		expect(PROVIDERS[PROVIDERS.length - 1].id).toBe('demo');
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
	it('builds dl.vidsrc.vip URLs for movie and episode', () => {
		const movie = downloadOptions({ id: 27205, type: 'movie' });
		expect(movie.length).toBeGreaterThan(0);
		expect(movie[0].url).toBe('https://dl.vidsrc.vip/movie/27205');
		const ep = downloadOptions({ id: 1396, type: 'tv', season: 2, episode: 3 });
		expect(ep[0].url).toBe('https://dl.vidsrc.vip/tv/1396/2/3');
	});
	it('stream-only providers never appear as download options', () => {
		const ids = downloadOptions({ id: 1, type: 'movie' }).map((o) => o.provider.id);
		expect(ids).not.toContain('vidlink');
		expect(ids).not.toContain('demo');
	});
});
