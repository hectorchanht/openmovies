import type { Title } from './types';
import { DEMO_TITLES } from './demo-data';

/**
 * Playback provider registry — the BingeBang / movie-web model: OpenMovies
 * never hosts video; it embeds third-party players keyed by TMDB id.
 * Providers die and move constantly (that is the whole domain-churn reality),
 * so each provider is one small adapter behind this interface: to swap one,
 * edit this file only.
 *
 * Verification status (2026-11-18, LIVE-probed from a residential IP in a
 * real browser after Hector's iPad "We Couldn't Find This Content" report):
 * - vidlink  — URL patterns + PLAYER_EVENT progress postMessages documented
 *              on vidlink.pro itself; live-verified (real streams). Its
 *              catalogue is spotty though — its API returns null for some
 *              major titles (Interstellar, Dune: Part Two, Coco, Game of
 *              Thrones S1), which is why the demo catalogue only lists
 *              titles VidLink was verified to carry (see demo-data.ts).
 * - vidfast  — vidfast.pro/movie/{id} and /tv/{id}/{s}/{e}; live-verified
 *              the same day (player + <video> element, including for
 *              titles VidLink lacks). Progress-event support is NOT
 *              verified, so progressEvents stays false.
 * - demo     — our own simulated player. Always works; used for demo rows
 *              and as the honest fallback when nothing else loads.
 *
 * EMBEDWAVE UPDATE (2026-11-20): embedwave.cc was VERIFIED sandbox-clean
 * in a real-browser harness the same day — inside an iframe carrying
 * exactly sandbox="allow-scripts allow-same-origin allow-presentation"
 * it loaded, scanned its sources and PLAYED (Tenet, TMDB 577922, Nitro
 * source 480p): no popup, no new tab, no top redirect, no sandbox
 * refusal. URL patterns are from its own docs (embedwave.cc/docs):
 * /embed/movie/{tmdb_id} and /embed/tv/{tmdb_id}/{season}/{episode}.
 * It is therefore Server 1 and the DEFAULT provider — the first real
 * provider that satisfies the P0 sandbox contract. Every other candidate
 * tested that day (Videasy, VidSrc.to, 2Embed, MultiEmbed, VidSrc.pk)
 * was disqualified on observed evidence.
 *
 * P0 UPDATE (2026-11-20, Hector ruling — see REAL-CATALOGUE-BRIEF.md §1):
 * opening a title must NEVER redirect/pop-under to an ad. VidLink served
 * a whole-tab redirect to an ad host in production, and both VidLink and
 * VidFast refuse to play inside a sandbox (their popunder is the revenue
 * model). All provider iframes are therefore sandboxed (Player.svelte)
 * by default, and VidLink/VidFast sit behind the clean providers with
 * honest 有廣告 tags. Their adapters stay here (never deleted).
 *
 * AD MODE UPDATE (2026-11-20, Hector refined ruling, same day, lightest
 * form): availability outranks ad-purity — sometimes only the
 * ad-supported providers can actually play, and the worst outcome is a
 * user left with nothing to watch. The disclosure is a simple
 * 有廣告 · Ads TAG on the provider's chip: a user who taps a tagged
 * provider has knowingly opted in — that tap IS the consent — so a
 * selected adSupported provider renders WITHOUT the sandbox directly,
 * with no extra notices, dialogs or enable steps (Player.svelte). Ad
 * Mode state follows that selection and stays sticky per device; the
 * visible toggle can switch it back off, which re-sandboxes everything
 * immediately. The default selection stays a clean provider, and
 * untagged providers are sandboxed in every state. OpenMovies earns
 * NOTHING from these ads — the provider forces them; they are not ours,
 * and the UI says so in one small line near the player.
 *
 * REMOVED 2026-11-18 (dead hosts, verified by DNS from two networks):
 * vidsrc (vidsrc.icu AND dl.vidsrc.vip both NXDOMAIN) and vidking
 * (vidking.net unresolvable). VidSrc was the only download source, so no
 * provider currently offers downloads: downloadOptions() returns [] and
 * the UI hides its download buttons instead of linking to dead hosts.
 * The capability machinery stays for the next provider that offers it.
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
	/**
	 * True when the provider is funded by ads/popunders and therefore
	 * refuses to play while sandboxed. Its chip carries the 有廣告 · Ads
	 * tag, and selecting it is the user's opt-in: a selected adSupported
	 * provider renders UNSANDBOXED (Player.svelte) unless the user has
	 * switched Ad Mode back off. Clean providers are always false here
	 * and are sandboxed in every state.
	 */
	adSupported: boolean;
	verified: boolean;
	/** Honest user-facing warning shown when this server is selected. */
	note?: string;
}

export const PROVIDERS: Provider[] = [
	{
		id: 'embedwave',
		label: 'Server 1 · EmbedWave',
		capabilities: ['stream'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie'
				? `https://embedwave.cc/embed/movie/${id}`
				: `https://embedwave.cc/embed/tv/${id}/${season}/${episode}`,
		progressEvents: false,
		adSupported: false,
		verified: true
	},
	{
		id: 'demo',
		label: 'Server 2 · Demo Player',
		capabilities: ['stream'],
		build: () => 'about:blank',
		progressEvents: false,
		adSupported: false,
		verified: true
	},
	{
		id: 'vidlink',
		label: 'Server 3 · VidLink · 有廣告 Ads',
		capabilities: ['stream'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie'
				? `https://vidlink.pro/movie/${id}?primaryColor=e8590c`
				: `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=e8590c`,
		progressEvents: true,
		adSupported: true,
		verified: true,
		note: 'VidLink is ad-funded (tagged 有廣告 on its chip). Selecting it loads it unsandboxed: a pop-up ad may open when you press play — close it once (tap X) and the movie plays. We earn nothing from these ads — the provider forces them; they are not ours.'
	},
	{
		id: 'vidfast',
		label: 'Server 4 · VidFast · 有廣告 Ads',
		capabilities: ['stream'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie' ? `https://vidfast.pro/movie/${id}` : `https://vidfast.pro/tv/${id}/${season}/${episode}`,
		progressEvents: false,
		adSupported: true,
		verified: true,
		note: 'VidFast is ad-funded (tagged 有廣告 on its chip). Selecting it loads it unsandboxed: a pop-up ad may open when you press play — close it once (tap X) and the movie plays. We earn nothing from these ads — the provider forces them; they are not ours.'
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
 * Chip suffix for a server button, given the provider ids the Worker's
 * edge health probe could NOT confirm. The only negative marker is
 * "· unverified": either we have never verified the provider ourselves,
 * or the edge probe (which runs from Cloudflare's network — a vantage
 * point providers routinely block, and which says nothing about a real
 * user's device) failed to confirm the host. Probe data must NEVER be
 * rendered as "down", and the player must never skip a server because of
 * it: servers are tried in listed order, and the user switches manually.
 */
export function providerMarker(p: { id: string; verified: boolean }, unconfirmedIds: readonly string[]): string {
	if (p.id === 'demo') return '';
	return !p.verified || unconfirmedIds.includes(p.id) ? ' · unverified' : '';
}

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
