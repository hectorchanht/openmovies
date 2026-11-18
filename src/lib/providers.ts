import type { Title } from './types';
import { DEMO_TITLES } from './demo-data';

/**
 * Playback provider registry — the BingeBang / movie-web model: OpenMovies
 * never hosts video; it embeds third-party players keyed by TMDB id.
 * Providers die and move constantly (that is the whole domain-churn reality),
 * so each provider is one small adapter behind this interface: to swap one,
 * edit this file only.
 *
 * Verification status (2026-11-18, checked from docs/search):
 * - vidlink  — URL patterns + PLAYER_EVENT progress postMessages documented
 *              on vidlink.pro itself. VERIFIED patterns.
 * - vidsrc   — vidsrc.icu embed patterns are the long-standing VidSrc scheme
 *              used across open-source forks. Pattern known; the .icu host
 *              itself was NOT live-probed from this VM (datacenter egress is
 *              blocked by several providers) — treat as UNVERIFIED live.
 * - vidking  — embed patterns documented in open-source TMDB integrations
 *              (vidking.net/embed/...). Pattern documented; host UNVERIFIED live.
 * - demo     — our own simulated player. Always works; used for demo rows
 *              and as the honest fallback when nothing else loads.
 */
export type Capability = 'stream' | 'download';

export interface Provider {
	id: string;
	label: string;
	/** What this provider can do: embed streaming, direct download, or both. */
	capabilities: Capability[];
	/** Build the embed URL. season/episode only apply to tv. */
	build: (t: { id: number; type: 'movie' | 'tv'; season?: number; episode?: number }) => string;
	/**
	 * Build a download URL when the provider exposes one (capability
	 * 'download'). Downloads are always free on OpenMovies — no tip gate
	 * (that model is OpenMusic-only, by Hector's decision 2026-11-18).
	 */
	buildDownload?: (t: { id: number; type: 'movie' | 'tv'; season?: number; episode?: number }) => string;
	/** True when the provider publishes progress postMessage events. */
	progressEvents: boolean;
	verified: boolean;
}

export const PROVIDERS: Provider[] = [
	{
		id: 'vidlink',
		label: 'Server 1 · VidLink',
		capabilities: ['stream'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie'
				? `https://vidlink.pro/movie/${id}?primaryColor=e8590c`
				: `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=e8590c`,
		progressEvents: true,
		verified: true
	},
	{
		id: 'vidsrc',
		label: 'Server 2 · VidSrc',
		capabilities: ['stream', 'download'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie'
				? `https://vidsrc.icu/embed/movie/${id}`
				: `https://vidsrc.icu/embed/tv/${id}/${season}/${episode}`,
		// Download endpoint dl.vidsrc.vip/{movie|tv}/... — pattern documented
		// in open-source integrations (e.g. EnjoyTown) and seen across live
		// download pages 2026-11-18; the host itself is UNVERIFIED live from
		// this VM, same class as the embed host.
		buildDownload: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie' ? `https://dl.vidsrc.vip/movie/${id}` : `https://dl.vidsrc.vip/tv/${id}/${season}/${episode}`,
		progressEvents: false,
		verified: false
	},
	{
		id: 'vidking',
		label: 'Server 3 · VidKing',
		capabilities: ['stream'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie'
				? `https://www.vidking.net/embed/movie/${id}?color=e8590c`
				: `https://www.vidking.net/embed/tv/${id}/${season}/${episode}?color=e8590c&episodeSelector=true`,
		progressEvents: false,
		verified: false
	},
	{
		id: 'demo',
		label: 'Server 4 · Demo Player',
		capabilities: ['stream'],
		build: () => 'about:blank',
		progressEvents: false,
		verified: true
	}
];

/** Providers that can download this title/episode, with their URLs. */
export function downloadOptions(t: {
	id: number;
	type: 'movie' | 'tv';
	season?: number;
	episode?: number;
}): { provider: Provider; url: string }[] {
	return PROVIDERS.filter((p) => p.capabilities.includes('download') && p.buildDownload).map((p) => ({
		provider: p,
		url: p.buildDownload!(t)
	}));
}

export const providerById = (id: string): Provider => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

/**
 * Parse a VidLink PLAYER_EVENT postMessage payload into a progress sample.
 * Pure + defensive: returns null for anything that is not a well-formed
 * PLAYER_EVENT with numeric currentTime/duration. (Contract documented on
 * vidlink.pro: events carry { type:'PLAYER_EVENT', data:{ event, currentTime,
 * duration, ... } }; some builds nest under `detail` — accept both.)
 */
export interface ProgressSample {
	event: string;
	currentTime: number;
	duration: number;
}

export function parseProgressMessage(raw: unknown): ProgressSample | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const msg = raw as Record<string, unknown>;
	const data = (typeof msg.data === 'object' && msg.data !== null ? msg.data : msg.detail) as
		| Record<string, unknown>
		| undefined;
	if (msg.type !== 'PLAYER_EVENT' || !data) return null;
	const { event, currentTime, duration } = data as { event?: unknown; currentTime?: unknown; duration?: unknown };
	if (typeof currentTime !== 'number' || typeof duration !== 'number' || duration <= 0) return null;
	return { event: typeof event === 'string' ? event : 'timeupdate', currentTime, duration };
}

export type { Title };
export const demoTitleCount = DEMO_TITLES.length;
