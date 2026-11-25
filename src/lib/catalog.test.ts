import { describe, expect, it } from 'vitest';
import { checkDomain, normalizeHost } from './checker';
import { filterTitles, genreMapFromList, mapTmdb, TmdbCatalog } from './tmdb';
import { DEMO_TITLES } from './demo-data';
import { BUILTIN_TRACKS, opensubtitlesSearchUrl, searchSubtitles } from './subtitles';
import { isUnreleased } from './types';

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
	it('mapTmdb carries the full release date (drives the unreleased state)', () => {
		const m = mapTmdb({ id: 1003596, title: 'Future Film', release_date: '2026-12-18', vote_average: 0, genres: [] }, 'movie');
		expect(m.releaseDate).toBe('2026-12-18');
		expect(m.year).toBe(2026);
		const tv = mapTmdb({ id: 9, name: 'Show', first_air_date: '2027-03-01', vote_average: 8, genres: [] }, 'tv');
		expect(tv.releaseDate).toBe('2027-03-01');
		const nodate = mapTmdb({ id: 1, title: 'X', vote_average: 1, genres: [] }, 'movie');
		expect(nodate.releaseDate).toBeUndefined();
	});
	it('demo catalogue lists only titles VidLink was verified to carry (carriage audit 2026-11-18)', () => {
		// VidLink's API returned null ("We Couldn't Find This Content") for
		// these major titles on 2026-11-18 — they must not come back into
		// the demo catalogue without a fresh live re-audit (see demo-data.ts).
		const banned = [157336, 693134, 354912, 1399]; // Interstellar, Dune: Part Two, Coco, Game of Thrones
		for (const id of banned) expect(DEMO_TITLES.map((t) => t.id)).not.toContain(id);
		expect(DEMO_TITLES.length).toBe(14);
		expect(new Set(DEMO_TITLES.map((t) => t.id)).size).toBe(DEMO_TITLES.length);
	});
	it('filterTitles applies type/genre/query together (browse flow)', () => {
		const r = filterTitles(DEMO_TITLES, { type: 'tv', genre: 'Drama' });
		expect(r.length).toBeGreaterThan(0);
		expect(r.every((t) => t.type === 'tv' && t.genres.includes('Drama'))).toBe(true);
		expect(filterTitles(DEMO_TITLES, { query: 'wick' }).map((t) => t.name)).toEqual(['John Wick: Chapter 4']);
	});
});

describe('TMDB genre mapping (G1) + split rows (G2)', () => {
	// Realistic TMDB shapes: list responses carry genre_ids (numbers),
	// genre lists carry { id, name } objects. Ids are the real TMDB ids.
	const MOVIE_GENRES = { genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }, { id: 18, name: 'Drama' }] };
	const TV_GENRES = { genres: [{ id: 18, name: 'Drama' }, { id: 10765, name: 'Sci-Fi & Fantasy' }, { id: 35, name: 'Comedy' }] };

	/** Fetch mock that routes by URL substring and (optionally) counts calls per route. */
	function routedFetch(routes: Record<string, unknown>, counts?: Record<string, number>) {
		return (async (url: string) => {
			for (const [needle, payload] of Object.entries(routes)) {
				if (url.includes(needle)) {
					if (counts) counts[needle] = (counts[needle] ?? 0) + 1;
					return new Response(JSON.stringify(payload), { status: 200 });
				}
			}
			return new Response('', { status: 404 });
		}) as typeof fetch;
	}

	it('genreMapFromList builds an id→name map and tolerates junk', () => {
		const m = genreMapFromList(MOVIE_GENRES);
		expect(m.get(28)).toBe('Action');
		expect(m.get(878)).toBe('Science Fiction');
		expect(genreMapFromList(null).size).toBe(0);
		expect(genreMapFromList({ genres: 'nope' }).size).toBe(0);
		expect(genreMapFromList({ results: [] }).size).toBe(0);
	});

	it('mapTmdb maps genre_ids through the genre map; detail genre objects win', () => {
		const map = genreMapFromList(MOVIE_GENRES);
		const t = mapTmdb(
			{ id: 27205, title: 'Inception', release_date: '2010-07-16', vote_average: 8.4, genre_ids: [28, 878, 99999] },
			'movie', 0, map
		);
		expect(t.genres).toEqual(['Action', 'Science Fiction']); // unknown id dropped
		const detail = mapTmdb(
			{ id: 1, title: 'X', release_date: '2020-01-01', vote_average: 7, genres: [{ name: 'Drama' }], genre_ids: [28] },
			'movie', 0, map
		);
		expect(detail.genres).toEqual(['Drama']);
		const noMap = mapTmdb({ id: 1, title: 'X', release_date: '2020-01-01', genre_ids: [28] }, 'movie');
		expect(noMap.genres).toEqual([]);
	});

	it('live trending maps genre_ids to names via the fetched genre lists', async () => {
		const fetchFn = routedFetch({
			'/genre/movie/list': MOVIE_GENRES,
			'/genre/tv/list': TV_GENRES,
			'/trending/all/week': {
				results: [
					{ id: 27205, media_type: 'movie', title: 'Inception', release_date: '2010-07-16', vote_average: 8.4, genre_ids: [28, 878] },
					{ id: 1396, media_type: 'tv', name: 'Breaking Bad', first_air_date: '2008-01-20', vote_average: 9.5, genre_ids: [18] }
				]
			}
		});
		const c = new TmdbCatalog('test-key', fetchFn);
		const r = await c.trending();
		expect(r.source).toBe('tmdb');
		expect(r.titles[0].genres).toEqual(['Action', 'Science Fiction']);
		expect(r.titles[1].genres).toEqual(['Drama']);
	});

	it('genre lists are fetched once per type and cached across calls', async () => {
		const counts: Record<string, number> = {};
		const fetchFn = routedFetch({
			'/genre/movie/list': MOVIE_GENRES,
			'/genre/tv/list': TV_GENRES,
			'/trending/movie/week': { results: [{ id: 1, title: 'A', release_date: '2020-01-01', vote_average: 7, genre_ids: [28] }] },
			'/trending/tv/week': { results: [{ id: 2, name: 'B', first_air_date: '2021-01-01', vote_average: 8, genre_ids: [35] }] }
		}, counts);
		const c = new TmdbCatalog('test-key', fetchFn);
		await c.trendingMovies();
		await c.trendingTv();
		await c.trendingMovies();
		expect(counts['/genre/movie/list']).toBe(1);
		expect(counts['/genre/tv/list']).toBe(1);
	});

	it('a genre-list outage degrades to empty genres, never a failure', async () => {
		const fetchFn = (async (url: string) => {
			if (url.includes('/genre/')) return new Response('', { status: 500 });
			return new Response(JSON.stringify({ results: [{ id: 1, title: 'A', release_date: '2020-01-01', vote_average: 7, genre_ids: [28] }] }), { status: 200 });
		}) as typeof fetch;
		const c = new TmdbCatalog('test-key', fetchFn);
		const r = await c.trendingMovies();
		expect(r.source).toBe('tmdb');
		expect(r.titles[0].genres).toEqual([]);
	});

	it('trendingMovies / trendingTv use the type-specific endpoints (results carry no media_type)', async () => {
		const fetchFn = routedFetch({
			'/genre/movie/list': MOVIE_GENRES,
			'/genre/tv/list': TV_GENRES,
			'/trending/movie/week': { results: [{ id: 1, title: 'Movie A', release_date: '2020-01-01', vote_average: 7, genre_ids: [28] }] },
			'/trending/tv/week': { results: [{ id: 2, name: 'Show B', first_air_date: '2021-01-01', vote_average: 8, genre_ids: [10765] }] }
		});
		const c = new TmdbCatalog('test-key', fetchFn);
		const m = await c.trendingMovies();
		expect(m.source).toBe('tmdb');
		expect(m.titles).toHaveLength(1);
		expect(m.titles[0]).toMatchObject({ type: 'movie', name: 'Movie A', genres: ['Action'] });
		const tv = await c.trendingTv();
		expect(tv.titles[0]).toMatchObject({ type: 'tv', name: 'Show B', genres: ['Sci-Fi & Fantasy'] });
	});

	it('topRated reads the real /top_rated endpoints, not the trending pool', async () => {
		const fetchFn = routedFetch({
			'/genre/movie/list': MOVIE_GENRES,
			'/genre/tv/list': TV_GENRES,
			'/movie/top_rated': { results: [{ id: 278, title: 'The Shawshank Redemption', release_date: '1994-09-23', vote_average: 9.3, genre_ids: [18] }] },
			'/tv/top_rated': { results: [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', vote_average: 9.5, genre_ids: [18] }] }
		});
		const c = new TmdbCatalog('test-key', fetchFn);
		const m = await c.topRated('movie');
		expect(m.source).toBe('tmdb');
		expect(m.titles[0]).toMatchObject({ name: 'The Shawshank Redemption', rating: 9.3, genres: ['Drama'] });
		const tv = await c.topRated('tv');
		expect(tv.titles[0]).toMatchObject({ type: 'tv', name: 'Breaking Bad' });
	});

	it('demo fallback works for every new row method without a key', async () => {
		const c = new TmdbCatalog(undefined);
		const m = await c.trendingMovies();
		expect(m.source).toBe('demo');
		expect(m.titles.length).toBeGreaterThan(0);
		expect(m.titles.every((t) => t.type === 'movie')).toBe(true);
		const tv = await c.trendingTv();
		expect(tv.source).toBe('demo');
		expect(tv.titles.every((t) => t.type === 'tv')).toBe(true);
		const top = await c.topRated('movie');
		expect(top.source).toBe('demo');
		expect(top.titles.every((t) => t.type === 'movie')).toBe(true);
		const ratings = top.titles.map((t) => t.rating);
		expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
	});
});

describe('subtitles adapter', () => {
	it('builds an OpenSubtitles search URL and degrades to built-in tracks without a key', async () => {
		expect(opensubtitlesSearchUrl({ tmdbId: 1396, type: 'tv', season: 1, episode: 2 })).toContain('tmdb_id=1396');
		expect(await searchSubtitles({ tmdbId: 1, type: 'movie' })).toEqual(BUILTIN_TRACKS);
	});
});

describe('isUnreleased (unreleased honesty state, 2026-11-24, restored)', () => {
	const now = new Date(2026, 10, 24); // 2026-11-24 local
	it('a future release date is unreleased (the Doomsday case)', () => {
		expect(isUnreleased('2026-12-16', now)).toBe(true);
		expect(isUnreleased('2027-03-01', now)).toBe(true);
	});
	it('today and the past count as released', () => {
		expect(isUnreleased('2026-11-24', now)).toBe(false);
		expect(isUnreleased('2020-05-01', now)).toBe(false);
	});
	it('missing or malformed dates never block a title', () => {
		expect(isUnreleased(undefined, now)).toBe(false);
		expect(isUnreleased('', now)).toBe(false);
		expect(isUnreleased('Dec 2026', now)).toBe(false);
	});
});
