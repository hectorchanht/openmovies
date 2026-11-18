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

const artFor = (i: number): string =>
	`linear-gradient(135deg, hsl(${(i * 47) % 360} 45% 26%), hsl(${(i * 47 + 60) % 360} 55% 12%))`;

/** Map one TMDB movie/tv result (or detail) into our Title shape. Pure. */
export function mapTmdb(raw: Record<string, unknown>, type: 'movie' | 'tv', i = 0): Title {
	const genres = Array.isArray(raw.genres)
		? (raw.genres as { name?: string }[]).map((g) => g.name ?? '').filter(Boolean)
		: [];
	return {
		id: Number(raw.id),
		type,
		name: String((type === 'movie' ? raw.title : raw.name) ?? raw.title ?? raw.name ?? 'Untitled'),
		year: Number(String((type === 'movie' ? raw.release_date : raw.first_air_date) ?? '0').slice(0, 4)) || 0,
		genres,
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

export class TmdbCatalog {
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

	async trending(): Promise<Catalog> {
		if (!this.key) return { titles: DEMO_TITLES, source: 'demo' };
		try {
			const data = (await this.get('/trending/all/week')) as { results: Record<string, unknown>[] };
			const titles = data.results
				.filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
				.map((r, i) => mapTmdb(r, r.media_type as 'movie' | 'tv', i));
			return titles.length ? { titles, source: 'tmdb' } : { titles: DEMO_TITLES, source: 'demo' };
		} catch {
			return { titles: DEMO_TITLES, source: 'demo' };
		}
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
		try {
			const data = (await this.get(`/search/multi?query=${encodeURIComponent(query)}`)) as {
				results: Record<string, unknown>[];
			};
			return {
				titles: data.results
					.filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
					.map((r, i) => mapTmdb(r, r.media_type as 'movie' | 'tv', i)),
				source: 'tmdb'
			};
		} catch {
			return { titles: [], source: 'tmdb' };
		}
	}

	async detail(id: number, type: 'movie' | 'tv'): Promise<Title | null> {
		if (!this.key) return DEMO_TITLES.find((t) => t.id === id && t.type === type) ?? null;
		try {
			const raw = (await this.get(`/${type}/${id}`)) as Record<string, unknown>;
			const base = mapTmdb(raw, type);
			const demo = DEMO_TITLES.find((t) => t.id === id && t.type === type);
			return { ...base, episodes: demo?.episodes };
		} catch {
			return DEMO_TITLES.find((t) => t.id === id && t.type === type) ?? null;
		}
	}

	/** "Because you watched" — TMDB similar when live; same-genre demo picks otherwise. Pure-ish helper. */
	async similar(title: Title): Promise<Title[]> {
		if (this.key) {
			try {
				const data = (await this.get(`/${title.type}/${title.id}/similar`)) as {
					results: Record<string, unknown>[];
				};
				return data.results.slice(0, 8).map((r, i) => mapTmdb(r, title.type, i));
			} catch {
				/* fall through to genre match */
			}
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
