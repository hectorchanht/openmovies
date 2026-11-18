/**
 * OpenSubtitles adapter (v1: adapter-level, as briefed).
 * Builds the OpenSubtitles search for a title and returns subtitle tracks.
 * Without an API key it returns the player's built-in track list (the honest
 * v1 behaviour: the embed providers ship their own subtitles, and this hook
 * is where a keyed OpenSubtitles search plugs in — set PUBLIC_OPENSUBTITLES_API_KEY).
 */
export interface SubtitleTrack {
	lang: string;
	label: string;
	source: 'provider' | 'opensubtitles';
	url?: string;
}

export const BUILTIN_TRACKS: SubtitleTrack[] = [
	{ lang: 'en', label: 'English (player)', source: 'provider' },
	{ lang: 'zh', label: '繁體中文 (player)', source: 'provider' },
	{ lang: 'off', label: 'Off', source: 'provider' }
];

export function opensubtitlesSearchUrl(opts: { tmdbId: number; type: 'movie' | 'tv'; season?: number; episode?: number; lang?: string }): string {
	const p = new URLSearchParams({ tmdb_id: String(opts.tmdbId), type: opts.type === 'movie' ? 'movie' : 'episode' });
	if (opts.season != null) p.set('season_number', String(opts.season));
	if (opts.episode != null) p.set('episode_number', String(opts.episode));
	if (opts.lang) p.set('languages', opts.lang);
	return `https://api.opensubtitles.com/api/v1/subtitles?${p.toString()}`;
}

export async function searchSubtitles(
	opts: { tmdbId: number; type: 'movie' | 'tv'; season?: number; episode?: number; lang?: string },
	apiKey?: string,
	fetchFn: typeof fetch = fetch
): Promise<SubtitleTrack[]> {
	if (!apiKey) return BUILTIN_TRACKS;
	try {
		const res = await fetchFn(opensubtitlesSearchUrl(opts), {
			headers: { 'Api-Key': apiKey, Accept: 'application/json' }
		});
		if (!res.ok) return BUILTIN_TRACKS;
		const data = (await res.json()) as { data?: { attributes?: { language?: string; files?: { link?: string }[] } }[] };
		const tracks: SubtitleTrack[] = (data.data ?? []).slice(0, 12).map((d) => ({
			lang: d.attributes?.language ?? 'en',
			label: `${(d.attributes?.language ?? 'en').toUpperCase()} (OpenSubtitles)`,
			source: 'opensubtitles' as const,
			url: d.attributes?.files?.[0]?.link
		}));
		return tracks.length ? [...BUILTIN_TRACKS.slice(0, 1), ...tracks] : BUILTIN_TRACKS;
	} catch {
		return BUILTIN_TRACKS;
	}
}
