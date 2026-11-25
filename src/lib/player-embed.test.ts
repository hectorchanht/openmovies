import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression guard for Hector's 2026-11-20 iPad incident: an UNSANDBOXED
// provider embed redirected the whole Safari tab to an ad host
// (ccads.adsboosters.xyz, a casino ad). Hector's rulings (2026-11-20,
// refined the same day): the DEFAULT is always ad-free and sandboxed —
// no forced ads, ever. But availability outranks ad-purity: sometimes
// only the ad-supported providers (VidLink/VidFast) can actually play,
// and the worst outcome is a user left with nothing to watch. In the
// lightest form of the ruling, the disclosure is a simple 有廣告 · Ads
// tag on the provider chip itself: a user who taps a tagged provider
// has knowingly opted in — that tap IS the consent — so a selected
// adSupported provider renders WITHOUT the sandbox directly, with no
// extra notices, dialogs or enable steps.
// Hector added a second, separate path on 2026-11-24: BingeAPI is the
// DEFAULT provider and may run with no sandbox at all — it is clean
// (no ads in the player), but its own docs say a sandbox blocks its
// player scripts, and Hector ruled "no sandbox is OK as long as we
// show user movies for free". That exception is named-provider only:
// it lives in the registry as requiresUnsandboxed=true on BingeAPI
// alone, never on an ad-supported provider.
// These tests pin exactly that contract: sandboxed by default with
// the safe token set, two registry-gated unsandboxed paths, and the
// tag-tap as the only ad opt-in. The vitest suite runs in a node environment (no DOM
// / testing-library in this repo), and the iframe only renders after
// the resolver fills `src`, so this asserts the contract on the
// component source itself — the exact place a regression would land.
const source = readFileSync(new URL('./components/Player.svelte', import.meta.url), 'utf8');
const providersSource = readFileSync(new URL('./providers.ts', import.meta.url), 'utf8');
const iframeTag = source.slice(source.indexOf('<iframe'), source.indexOf('>', source.indexOf('<iframe')) + 1);

// Tokens that would let an embed navigate the top tab or open popups —
// the exact capabilities behind the 2026-11-20 incident. They must never
// appear as sandbox tokens anywhere in the player or the provider
// registry (Ad Mode removes the sandbox attribute outright for one
// gated provider; it never widens it with these tokens).
const FORBIDDEN_SANDBOX_TOKENS = [
	'allow-top-navigation',
	'allow-top-navigation-by-user-activation',
	'allow-popups',
	'allow-popups-to-escape-sandbox',
	'allow-modals'
];

describe('provider embed iframe (Player.svelte)', () => {
	it('exists and points at the resolved source', () => {
		expect(iframeTag).toContain('<iframe');
		expect(iframeTag).toContain('src={src}');
	});

	it('renders exactly one iframe — no second, unguarded embed path', () => {
		expect(source.match(/<iframe/g)).toHaveLength(1);
	});

	it('is sandboxed by default with exactly the safe token set', () => {
		expect(iframeTag).toContain(
			"sandbox={embedUnsandboxed ? undefined : 'allow-scripts allow-same-origin allow-presentation'}"
		);
	});

	it('the unsandboxed paths are exactly two, both registry-gated: requiresUnsandboxed, or Ad Mode AND an ad-supported provider', () => {
		expect(source).toContain(
			'const embedUnsandboxed = $derived(currentProvider.requiresUnsandboxed || (adMode && currentProvider.adSupported))'
		);
	});

	it('recreates the iframe when the sandbox state flips (browsers apply sandbox flags at navigation)', () => {
		expect(source).toContain('{#key embedUnsandboxed}');
	});

	it('never grants top-navigation or popup capabilities anywhere in the player or providers', () => {
		for (const token of FORBIDDEN_SANDBOX_TOKENS) {
			expect(source).not.toContain(token);
			expect(providersSource).not.toContain(token);
			expect(iframeTag).not.toContain(token);
		}
	});

	it('defaults to BingeAPI (Hector 2026-11-24: default use BingeAPI, no sandbox OK)', () => {
		expect(source).toContain("$state('bingeapi')");
		expect(providersSource).toContain("id: 'bingeapi'");
		expect(providersSource).toContain('requiresUnsandboxed: true');
	});

	it('grants the playback permissions embeds need', () => {
		expect(iframeTag).toContain('allow="autoplay; fullscreen; encrypted-media; picture-in-picture"');
		expect(iframeTag).toContain('allowfullscreen');
	});

	it('keeps the origin-only referrer policy', () => {
		expect(iframeTag).toContain('referrerpolicy="origin"');
	});
});

describe('Ad Mode (Player.svelte)', () => {
	it('defaults OFF and persists per device under the om_ad_mode key', () => {
		expect(source).toContain('let adMode = $state(false)');
		expect(source).toContain("'om_ad_mode'");
		expect(source).toContain('localStorage.getItem(AD_MODE_KEY)');
		expect(source).toContain('localStorage.setItem(AD_MODE_KEY');
	});

	it('shows a visible toggle with its state', () => {
		expect(source).toContain('廣告模式 Ad Mode');
		expect(source).toContain('aria-pressed={adMode}');
	});

	it('treats tapping a tagged chip as the opt-in itself — it enables Ad Mode directly', () => {
		expect(source).toContain('if (providerById(id).adSupported) setAdMode(true);');
	});

	it('has NO extra gate for a tagged provider — no enable button, no notice block, no dialog', () => {
		expect(source).not.toContain('開廣告模式睇');
		expect(source).not.toContain('adnotice');
		expect(source).not.toContain('{#if currentProvider.adSupported && !adMode}');
	});

	it('shows the one-line no-revenue note for a tagged provider — information, not a gate', () => {
		expect(source).toContain('{#if currentProvider.adSupported}');
		expect(source).toContain('我哋唔會從呢啲廣告賺錢');
		expect(source).toContain('We earn nothing from these ads');
	});
});

describe('automatic failover (Player.svelte, 2026-11-24, restored)', () => {
	it('arms a device-side liveness timer for each fresh embed URL', () => {
		expect(source).toContain('FAILOVER_TIMEOUT_MS');
		expect(source).toContain('setTimeout(onFailoverTimeout, FAILOVER_TIMEOUT_MS)');
		expect(source).toContain('armFailover()');
	});
	it('treats a load event on the embed frame as a sign of life', () => {
		expect(iframeTag).toContain('onload={onFrameLoad}');
		expect(source).toContain('function onFrameLoad()');
	});
	it('treats any postMessage from the embed origin as a sign of life', () => {
		expect(source).toContain('markSignalled();');
	});
	it('advances through the providers.ts rotation and announces the switch', () => {
		expect(source).toContain('nextFailoverProvider(providerId, triedIds, { adMode })');
		expect(source).toContain("didn't respond — switched to");
		expect(source).toContain('已自動切換至');
		expect(source).toContain('failoverNote');
	});
	it('manual switching resets the rotation (the user takes over)', () => {
		expect(source).toContain('if (!failoverJump) {');
	});
	it('never arms failover for the simulated Demo Player or unreleased titles', () => {
		expect(source).toContain("if (unreleased || providerId === 'demo' || !src) return;");
	});
});

describe('unreleased titles (Player.svelte, 2026-11-24, restored)', () => {
	it('derives the state from the TMDB release date', () => {
		expect(source).toContain('isUnreleased(title.releaseDate)');
	});
	it('shows the bilingual honesty state instead of dead server chips', () => {
		expect(source).toContain('{#if unreleased}');
		expect(source).toContain('Not yet released — no sources exist yet · 未上映，未有片源');
		expect(source).toContain('Expected release · 預計上映：{title.releaseDate}');
	});
	it('does not resolve any embed for an unreleased title', () => {
		expect(source).toContain('if (unreleased) {');
	});
});

describe('speed transparency — device probe is primary (Player.svelte, ruling 2)', () => {
	it('probes provider origins from the device at page load', () => {
		expect(source).toContain('probeDeviceLatency');
		expect(source).toContain('deviceProbes');
	});
	it('passes the device probes into the chip speed labels', () => {
		expect(source).toContain('chipSpeedLabel(p.id, healthList, measurements, deviceProbes)');
	});
});

describe('watch page — loading never lies (Wave 1 hang fix)', () => {
	const watch = readFileSync('src/routes/watch/[id]/+page.svelte', 'utf8');
	it('a failed catalog lookup shows an honest error + retry, not eternal "Loading player…"', () => {
		expect(watch).toContain('loadFailed');
		expect(watch).toContain('{:else if loadFailed}');
		expect(watch).toContain('Retry · 重試');
		expect(watch).toContain("Couldn't load this title");
	});
	it('the retry re-runs the same load path (one function, one path)', () => {
		expect(watch).toContain('void loadTitle()');
		expect(watch).toContain('function retryLoad()');
	});
});

describe('cover-flight embed warming (flight.ts + PosterCard, ruling 4)', () => {
	const cardSource = readFileSync(new URL('./components/PosterCard.svelte', import.meta.url), 'utf8');
	const flightSource = readFileSync(new URL('./flight.ts', import.meta.url), 'utf8');
	it('the card tap starts the embed warming in parallel with the flight', () => {
		expect(cardSource).toContain('warmEmbed');
		expect(cardSource).toContain('flightEmbedUrlFor');
		expect(cardSource).toContain('store.startFlight');
	});
	it('the warm-up loads the default provider embed URL for the tapped title', () => {
		expect(flightSource).toContain("providerById('bingeapi').build");
		expect(flightSource).toContain('warmEmbed');
	});
});
