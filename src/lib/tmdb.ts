import { DEMO_TITLES } from './demo-data';
import type { Title } from './types';

/**
 * TMDB adapter. Reads PUBLIC_TMDB_API_KEY (TMDB v3 keys are client-exposed by
 * design in countless open-source apps; the key is read from build-time env,
 * never hard-coded). With no key — or on any TMDB failure — every method
 * falls back to the bundled demo dataset so the app always runs.
 */
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w500';

export interface Catalog {
	titles: Title[];
	source: 'tmdb' | 'demo';
}

type FetchFn = typeof fetch;
type MediaType = 'movie' | 'tv';

/** TMDB genre id → name map for one media type (from /genre/{type}/list). */
export type GenreMap = ReadonlyMap<number, string>;

/**
 * Build a genre id→name map from a TMDB /genre/{type}/list payload
 * (`{ genres: [{ id, name }] }`). Pure + defensive: anything malformed
 * yields an empty (or partial) map, never a throw.
 */
export function genreMapFromList(raw: unknown): Map<number, string> {
	const map = new Map<number, string>();
	if (typeof raw !== 'object' || raw === null) return map;
	const genres = (raw as { genres?: unknown }).genres;
	if (!Array.isArray(genres)) return map;
	for (const g of genres as { id?: unknown; name?: unknown }[]) {
		if (typeof g?.id === 'number' && typeof g?.name === 'string' && g.name) map.set(g.id, g.name);
	}
	return map;
}

const artFor = (i: number): string =>
	`linear-gradient(135deg, hsl(${(i * 47) % 360} 45% 26%), hsl(${(i * 47 + 60) % 360} 55% 12%))`;

/**
 * Genre names for one TMDB result. Detail responses carry `genres`
 * (objects with names) — those win. List responses (/trending, /search,
 * /top_rated, …) carry only `genre_ids`, which need the genre map
 * (G1 fix, 2026-11-20: without this every live list title mapped to
 * `genres: []` and Browse genre filtering was dead).
 */
function genresOf(raw: Record<string, unknown>, genreMap?: GenreMap): string[] {
	if (Array.isArray(raw.genres)) {
		const names = (raw.genres as { name?: string }[]).map((g) => g.name ?? '').filter(Boolean);
		if (names.length) return names;
	}
	if (Array.isArray(raw.genre_ids) && genreMap) {
		return (raw.genre_ids as unknown[])
			.filter((id): id is number => typeof id === 'number')
			.map((id) => genreMap.get(id) ?? '')
			.filter(Boolean);
	}
	return [];
}

/** Map one TMDB movie/tv result (or detail) into our Title shape. Pure. */
export function mapTmdb(raw: Record<string, unknown>, type: MediaType, i = 0, genreMap?: GenreMap): Title {
	const dateRaw = type === 'movie' ? raw.release_date : raw.first_air_date;
	return {
		id: Number(raw.id),
		type,
		name: String((type === 'movie' ? raw.title : raw.name) ?? raw.title ?? raw.name ?? 'Untitled'),
		year: Number(String(dateRaw ?? '0').slice(0, 4)) || 0,
		releaseDate: typeof dateRaw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : undefined,
		genres: genresOf(raw, genreMap),
		rating: Math.round(Number(raw.vote_average ?? 0) * 10) / 10,
		overview: String(raw.overview ?? ''),
		runtimeMin: typeof raw.runtime === 'number' ? raw.runtime : undefined,
		seasons: typeof raw.number_of_seasons === 'number' ? raw.number_of_seasons : undefined,
		art: artFor(i),
		posterPath: typeof raw.poster_path === 'string' ? raw.poster_path : null,
		backdropPath: typeof raw.backdrop_path === 'string' ? raw.backdrop_path : null
	};
}

export const posterUrl = (t: Title): string | null => (t.posterPath ? `${IMG}${t.posterPath}` : null);

const demoOfType = (type: MediaType): Title[] => DEMO_TITLES.filter((t) => t.type === type);
const demoTopRated = (type: MediaType): Title[] => [...demoOfType(type)].sort((a, b) => b.rating - a.rating);

export class TmdbCatalog {
	// Genre id→name maps, fetched once per instance and reused by every
	// list call (G1). Null until first use; a failed load caches empty
	// maps so a genre outage degrades to nameless genres, never a crash.
	private genreMapsCache: Record<MediaType, Map<number, string>> | null = null;
	private genreMapsLoad: Promise<Record<MediaType, Map<number, string>>> | null = null;

	constructor(
		private key: string | undefined,
		private fetchFn: FetchFn = fetch
	) {}

	get live(): boolean {
		return !!this.key;
	}

	private async get(path: string): Promise<unknown> {
		const res = await this.fetchFn(`${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${this.key}`);
		if (!res.ok) throw new Error(`TMDB ${res.status}`);
		return res.json();
	}

	/** Load (once, cached) the movie + TV genre lists. Never throws. */
	private async genreMaps(): Promise<Record<MediaType, Map<number, string>>> {
		if (this.genreMapsCache) return this.genreMapsCache;
		if (!this.key) {
			this.genreMapsCache = { movie: new Map(), tv: new Map() };
			return this.genreMapsCache;
		}
		this.genreMapsLoad ??= (async () => {
			const loadOne = async (type: MediaType): Promise<Map<number, string>> => {
				try {
					return genreMapFromList(await this.get(`/genre/${type}/list`));
				} catch {
					return new Map();
				}
			};
			const maps: Record<MediaType, Map<number, string>> = { movie: await loadOne('movie'), tv: await loadOne('tv') };
			this.genreMapsCache = maps;
			return maps;
		})();
		return this.genreMapsLoad;
	}

	/**
	 * Fetch one TMDB list endpoint and map its results. `fixedType` is
	 * for type-specific endpoints (/trending/movie/week, /movie/top_rated)
	 * whose results carry no `media_type`; mixed endpoints (/trending/all)
	 * filter + map per-result. Returns null on any failure so callers can
	 * apply their own demo fallback.
	 */
	private async fetchList(path: string, fixedType?: MediaType): Promise<Title[] | null> {
		try {
			const maps = await this.genreMaps();
			const data = (await this.get(path)) as { results?: Record<string, unknown>[] };
			if (!Array.isArray(data.results)) return null;
			if (fixedType) {
				return data.results.map((r, i) => mapTmdb(r, fixedType, i, maps[fixedType]));
			}
			return data.results
				.filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
				.map((r, i) => mapTmdb(r, r.media_type as MediaType, i, maps[r.media_type as MediaType]));
		} catch {
			return null;
		}
	}

	async trending(): Promise<Catalog> {
		if (!this.key) return { titles: DEMO_TITLES, source: 'demo' };
		const titles = await this.fetchList('/trending/all/week');
		return titles?.length ? { titles, source: 'tmdb' } : { titles: DEMO_TITLES, source: 'demo' };
	}

	/** Trending movies only (G2: homepage rows are separate real feeds). */
	async trendingMovies(): Promise<Catalog> {
		if (!this.key) return { titles: demoOfType('movie'), source: 'demo' };
		const titles = await this.fetchList('/trending/movie/week', 'movie');
		return titles?.length ? { titles, source: 'tmdb' } : { titles: demoOfType('movie'), source: 'demo' };
	}

	/** Trending TV only (G2). */
	async trendingTv(): Promise<Catalog> {
		if (!this.key) return { titles: demoOfType('tv'), source: 'demo' };
		const titles = await this.fetchList('/trending/tv/week', 'tv');
		return titles?.length ? { titles, source: 'tmdb' } : { titles: demoOfType('tv'), source: 'demo' };
	}

	/**
	 * Real TMDB top-rated catalogue for one media type (G2 — replaces the
	 * old fake "Top Rated" that sorted the shared trending pool client-side).
	 */
	async topRated(type: MediaType): Promise<Catalog> {
		if (!this.key) return { titles: demoTopRated(type), source: 'demo' };
		const titles = await this.fetchList(`/${type}/top_rated`, type);
		return titles?.length ? { titles, source: 'tmdb' } : { titles: demoTopRated(type), source: 'demo' };
	}

	async search(query: string): Promise<Catalog> {
		const q = query.trim().toLowerCase();
		if (!q) return this.trending();
		if (!this.key) {
			return {
				titles: DEMO_TITLES.filter(
					(t) => t.name.toLowerCase().includes(q) || t.genres.some((g) => g.toLowerCase().includes(q))
				),
				source: 'demo'
			};
		}
		const titles = await this.fetchList(`/search/multi?query=${encodeURIComponent(query)}`);
		return titles ? { titles, source: 'tmdb' } : { titles: [], source: 'tmdb' };
	}

	async detail(id: number, type: MediaType): Promise<Title | null> {
		if (!this.key) return DEMO_TITLES.find((t) => t.id === id && t.type === type) ?? null;
		try {
			const maps = await this.genreMaps();
			const raw = (await this.get(`/${type}/${id}`)) as Record<string, unknown>;
			const base = mapTmdb(raw, type, 0, maps[type]);
			const demo = DEMO_TITLES.find((t) => t.id === id && t.type === type);
			return { ...base, episodes: demo?.episodes };
		} catch {
			return DEMO_TITLES.find((t) => t.id === id && t.type === type) ?? null;
		}
	}

	/** "Because you watched" — TMDB similar when live; same-genre demo picks otherwise. Pure-ish helper. */
	async similar(title: Title): Promise<Title[]> {
		if (this.key) {
			const titles = await this.fetchList(`/${title.type}/${title.id}/similar`, title.type);
			if (titles) return titles.slice(0, 8);
		}
		return DEMO_TITLES.filter((t) => t.id !== title.id && t.genres.some((g) => title.genres.includes(g))).slice(0, 8);
	}
}

/** Filter helper shared by Browse (pure, tested). */
export function filterTitles(titles: Title[], opts: { type?: 'movie' | 'tv' | 'all'; genre?: string; query?: string }): Title[] {
	return titles.filter((t) => {
		if (opts.type && opts.type !== 'all' && t.type !== opts.type) return false;
		if (opts.genre && opts.genre !== 'All' && !t.genres.includes(opts.genre)) return false;
		if (opts.query && !t.name.toLowerCase().includes(opts.query.trim().toLowerCase())) return false;
		return true;
	});
}
