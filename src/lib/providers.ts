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
 *              DOMAIN UPDATE (2026-11-24): vidfast.pro now 301-redirects
 *              to vidfast.vc — the adapter points at .vc directly rather
 *              than depending on the redirect surviving.
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
 * BINGEAPI DEFAULT (2026-11-24, Hector ruling): BingeAPI
 * (bingeapi.com, embed host bingeapi.st) is the DEFAULT provider —
 * the BingeBang player as an embed: free, no signup, no API key, no
 * ads in the player, 12 servers behind one iframe with AUTOMATIC
 * failover (the FMHY grading criterion OpenMovies kept failing),
 * up to 4K, subtitles in 40+ languages, TMDB or IMDb ids, and a
 * postMessage API (source 'bingeapi_player'; see parseBingeMessage).
 * Its docs explicitly say NOT to add a sandbox attribute (it blocks
 * the scripts the player needs), and Hector ruled the same day:
 * "Default use bingeapi, no sandbox is OK as long as we show user
 * movies for free." So BingeAPI carries requiresUnsandboxed=true and
 * renders without a sandbox BY DEFAULT — a named-provider exception
 * to the sandbox contract, not a blanket reversal: it is not
 * adSupported (no ads, no 有廣告 tag, no Ad Mode needed), and if it
 * ever serves popunders/redirects the exception dies and it is
 * demoted like VidLink/VidFast were. EmbedWave stays as the
 * sandbox-clean fallback.
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
	/**
	 * True when a CLEAN (non-ad) provider's own docs require it to run
	 * without a sandbox at all (BingeAPI: a sandbox blocks its player
	 * scripts). Hector's 2026-11-24 ruling names BingeAPI explicitly:
	 * it renders unsandboxed by default. This is separate from
	 * adSupported — no ads, no tag, no Ad Mode opt-in — and the
	 * exception is revoked the day the provider serves ads/redirects.
	 */
	requiresUnsandboxed: boolean;
	verified: boolean;
	/** Honest user-facing warning shown when this server is selected. */
	note?: string;
}

export const PROVIDERS: Provider[] = [
	{
		id: 'bingeapi',
		label: 'Server 1 · BingeAPI',
		capabilities: ['stream'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie'
				? `https://bingeapi.st/embed/movie/${id}?color=e8590c&autoplay=1`
				: `https://bingeapi.st/embed/tv/${id}/${season}/${episode}?color=e8590c&autoplay=1`,
		progressEvents: true,
		adSupported: false,
		// THE one-line kill switch for the no-sandbox exception (Hector
		// 2026-11-24): if BingeAPI ever serves popunders/redirects, flip
		// requiresUnsandboxed to false here and it is sandboxed again;
		// demotion is moving this entry down the PROVIDERS array. No
		// other code needs to change — Player.svelte reads only this flag.
		requiresUnsandboxed: true,
		verified: true
	},
	{
		id: 'embedwave',
		label: 'Server 2 · EmbedWave',
		capabilities: ['stream'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie'
				? `https://embedwave.cc/embed/movie/${id}`
				: `https://embedwave.cc/embed/tv/${id}/${season}/${episode}`,
		progressEvents: false,
		adSupported: false,
		requiresUnsandboxed: false,
		verified: true
	},
	{
		id: 'demo',
		label: 'Server 3 · Demo Player',
		capabilities: ['stream'],
		build: () => 'about:blank',
		progressEvents: false,
		adSupported: false,
		requiresUnsandboxed: false,
		verified: true
	},
	{
		id: 'vidlink',
		label: 'Server 4 · VidLink · 有廣告 Ads',
		capabilities: ['stream'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie'
				? `https://vidlink.pro/movie/${id}?primaryColor=e8590c`
				: `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=e8590c`,
		progressEvents: true,
		adSupported: true,
		requiresUnsandboxed: false,
		verified: true,
		note: 'VidLink is ad-funded (tagged 有廣告 on its chip). Selecting it loads it unsandboxed: a pop-up ad may open when you press play — close it once (tap X) and the movie plays. We earn nothing from these ads — the provider forces them; they are not ours.'
	},
	{
		id: 'vidfast',
		label: 'Server 5 · VidFast · 有廣告 Ads',
		capabilities: ['stream'],
		build: ({ id, type, season = 1, episode = 1 }) =>
			type === 'movie' ? `https://vidfast.vc/movie/${id}` : `https://vidfast.vc/tv/${id}/${season}/${episode}`,
		progressEvents: false,
		adSupported: true,
		requiresUnsandboxed: false,
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
 * it. (The player's automatic failover is a separate mechanism driven by
 * the USER'S OWN device failing to get any sign of life from an embed —
 * never by this probe. See nextFailoverProvider.)
 */
export function providerMarker(p: { id: string; verified: boolean }, unconfirmedIds: readonly string[]): string {
	if (p.id === 'demo') return '';
	return !p.verified || unconfirmedIds.includes(p.id) ? ' · unverified' : '';
}

/**
 * How long the player waits for ANY sign of life from a freshly loaded
 * embed (iframe load event, or a postMessage from the embed's origin)
 * before auto-advancing to the next server. Generous on purpose: real
 * providers can take several seconds to scan their sources, and a false
 * advance costs the user their server; a dead one costs only this wait.
 */
export const FAILOVER_TIMEOUT_MS = 15_000;

/**
 * The automatic-failover rotation, in registry order. Two exclusions,
 * both honesty/consent rules:
 * - the Demo Player is never auto-advanced INTO — it is simulated, so
 *   landing there would fake a success; it stays manually selectable.
 * - ad-supported providers join ONLY when Ad Mode is already on — the
 *   user's earlier chip tap was the opt-in; auto-advance must never be
 *   the thing that first renders an unsandboxed ad embed.
 * The rotation starts from the default (BingeAPI, Server 1) and walks
 * the registry from wherever the user currently is.
 */
export function failoverRotation(adMode: boolean): Provider[] {
	return PROVIDERS.filter((p) => p.id !== 'demo' && (adMode || !p.adSupported));
}

/**
 * Next server to try after `currentId` shows no sign of life, or null
 * when every candidate has been tried. Walks the rotation starting
 * AFTER the current provider (wrapping once), skipping ids in `tried`.
 * Pure — Player.svelte owns the timer and the switching.
 */
export function nextFailoverProvider(
	currentId: string,
	tried: readonly string[],
	opts: { adMode: boolean }
): Provider | null {
	const order = failoverRotation(opts.adMode);
	if (!order.length) return null;
	const start = order.findIndex((p) => p.id === currentId);
	const seq = start >= 0 ? [...order.slice(start + 1), ...order.slice(0, start)] : order;
	return seq.find((p) => !tried.includes(p.id) && p.id !== currentId) ?? null;
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

/**
 * Parse a BingeAPI postMessage payload (docs at bingeapi.com/docs):
 * events arrive as { source: 'bingeapi_player', event, info } where
 * 'time' carries the current time in seconds (at most once a second)
 * and 'duration' carries the length in seconds, as separate events —
 * unlike VidLink's combined samples. Returns a normalised sample:
 * a 'time' event yields { event:'time', currentTime } with no
 * duration, a 'duration' event yields { event:'duration', duration }
 * with no currentTime; the caller pairs them. Anything else (other
 * events, other sources, junk) returns null.
 */
export interface BingeSample {
	event: string;
	currentTime?: number;
	duration?: number;
	/** Set on 'serverchange': the name of the internal server now playing. */
	server?: string;
}

export function parseBingeMessage(raw: unknown): BingeSample | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const msg = raw as Record<string, unknown>;
	if (msg.source !== 'bingeapi_player' || typeof msg.event !== 'string') return null;
	if (msg.event === 'time' && typeof msg.info === 'number' && msg.info >= 0)
		return { event: 'time', currentTime: msg.info };
	if (msg.event === 'duration' && typeof msg.info === 'number' && msg.info > 0)
		return { event: 'duration', duration: msg.info };
	if (msg.event === 'serverchange' && typeof msg.info === 'string' && msg.info.length > 0)
		return { event: 'serverchange', server: msg.info };
	return null;
}

/**
 * BingeAPI's internal servers (bingeapi.com/docs, server numbers are
 * the `servers=` URL option order). BingeAPI checks every title across
 * all of them and fails over automatically; OpenMovies cannot probe
 * them individually from outside the iframe, so what we show the user
 * is this list with each server's max quality, plus the LIVE server
 * name the player reports via its 'serverchange' event.
 */
export interface BingeServer {
	num: number;
	name: string;
	quality: string;
}

export const BINGE_SERVERS: BingeServer[] = [
	{ num: 81, name: 'Aldebaran', quality: 'HD' },
	{ num: 80, name: 'Sirius', quality: 'up to 4K' },
	{ num: 94, name: 'Tarazed', quality: 'up to 4K' },
	{ num: 85, name: 'Markab', quality: 'HD' },
	{ num: 87, name: 'Yildun', quality: 'up to 4K' },
	{ num: 86, name: 'Vega', quality: 'HD' },
	{ num: 93, name: 'Mira', quality: 'HD' },
	{ num: 84, name: 'Wezen', quality: 'up to 4K' },
	{ num: 82, name: 'Fomalhaut', quality: 'HD' },
	{ num: 88, name: 'Nashira', quality: 'up to 4K' },
	{ num: 92, name: 'Botein', quality: 'HD' },
	{ num: 91, name: 'Ogma', quality: 'HD' }
];

export const bingeServerQuality = (name: string): string | null =>
	BINGE_SERVERS.find((s) => s.name.toLowerCase() === name.toLowerCase())?.quality ?? null;

export type { Title };
export const demoTitleCount = DEMO_TITLES.length;
