import { describe, expect, it } from 'vitest';
import { checkDomain, normalizeHost } from './checker';
import { filterTitles, mapTmdb, TmdbCatalog } from './tmdb';
import { DEMO_TITLES } from './demo-data';
import { BUILTIN_TRACKS, opensubtitlesSearchUrl, searchSubtitles } from './subtitles';

describe('domain checker', () => {
	it('normalises URLs to hosts', () => {
		expect(normalizeHost('https://www.OpenMovies.dawnstudio.app/watch/1?x=2')).toBe('openmovies.dawnstudio.app');
	});
	it('recognises the official home and the gateway hub', () => {
		expect(checkDomain('openmovies.dawnstudio.app').kind).toBe('official');
		expect(checkDomain('https://dawnstudio.app/gateway').kind).toBe('gateway');
	});
	it('flags look-alikes and unknowns as not official', () => {
		expect(checkDomain('openmovies.buzz').kind).toBe('lookalike');
		expect(checkDomain('openmovies-free.example.com').kind).toBe('lookalike');
		expect(checkDomain('totally-random-site.com').kind).toBe('unknown');
		expect(checkDomain('totally-random-site.com').message).toContain('Not official');
	});
});

describe('TMDB adapter', () => {
	it('demo mode: trending returns the demo dataset, search filters it', async () => {
		const c = new TmdbCatalog(undefined);
		expect((await c.trending()).source).toBe('demo');
		const r = await c.search('inception');
		expect(r.titles.map((t) => t.name)).toEqual(['Inception']);
	});
	it('live mode maps TMDB payloads and falls back to demo on failure', async () => {
		const okFetch = async () =>
			new Response(JSON.stringify({ results: [{ id: 1, media_type: 'movie', title: 'X', release_date: '2020-05-01', vote_average: 7.26, overview: 'o', genres: [] }] }), { status: 200 });
		const c = new TmdbCatalog('test-key', okFetch as typeof fetch);
		const r = await c.trending();
		expect(r.source).toBe('tmdb');
		expect(r.titles[0]).toMatchObject({ id: 1, name: 'X', year: 2020, rating: 7.3 });
		const bad = new TmdbCatalog('k', (async () => new Response('', { status: 500 })) as typeof fetch);
		expect((await bad.trending()).source).toBe('demo');
	});
	it('mapTmdb handles tv naming and genre objects', () => {
		const t = mapTmdb({ id: 9, name: 'Show', first_air_date: '2021-01-01', vote_average: 8, genres: [{ name: 'Drama' }] }, 'tv');
		expect(t).toMatchObject({ name: 'Show', year: 2021, genres: ['Drama'] });
	});
	it('filterTitles applies type/genre/query together (browse flow)', () => {
		const r = filterTitles(DEMO_TITLES, { type: 'tv', genre: 'Drama' });
		expect(r.length).toBeGreaterThan(0);
		expect(r.every((t) => t.type === 'tv' && t.genres.includes('Drama'))).toBe(true);
		expect(filterTitles(DEMO_TITLES, { query: 'wick' }).map((t) => t.name)).toEqual(['John Wick: Chapter 4']);
	});
});

describe('subtitles adapter', () => {
	it('builds an OpenSubtitles search URL and degrades to built-in tracks without a key', async () => {
		expect(opensubtitlesSearchUrl({ tmdbId: 1396, type: 'tv', season: 1, episode: 2 })).toContain('tmdb_id=1396');
		expect(await searchSubtitles({ tmdbId: 1, type: 'movie' })).toEqual(BUILTIN_TRACKS);
	});
});
