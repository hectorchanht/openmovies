import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression guard for Hector's 2026-11-20 iPad incident: an UNSANDBOXED
// provider embed redirected the whole Safari tab to an ad host
// (ccads.adsboosters.xyz, a casino ad). Hector's rulings (2026-11-20,
// refined the same day): the DEFAULT is always ad-free and sandboxed —
// no forced ads, ever. But availability outranks ad-purity: sometimes
// only the ad-supported providers (VidLink/VidFast) can actually play,
// and the worst outcome is a user left with nothing to watch. So an
// explicit, user-opened Ad Mode may render an adSupported provider's
// iframe WITHOUT the sandbox — inside that mode only, for ad-supported
// providers only. These tests pin exactly that contract: sandboxed by
// default with the safe token set, and a single, doubly-gated
// unsandboxed path. The vitest suite runs in a node environment (no DOM
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

	it('the ONLY unsandboxed path is gated on Ad Mode AND an ad-supported provider', () => {
		expect(source).toContain('const embedUnsandboxed = $derived(adMode && currentProvider.adSupported)');
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

	it('defaults to the Demo Player, the only verified ad-free player', () => {
		expect(source).toContain("$state('demo')");
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

	it('offers the explicit opt-in button when an ad-funded server is blocked by the sandbox', () => {
		expect(source).toContain('{#if currentProvider.adSupported && !adMode}');
		expect(source).toContain('開廣告模式睇');
		expect(source).toContain('setAdMode(true)');
	});

	it('reminds the user of the trade while Ad Mode is on for an ad-funded server', () => {
		expect(source).toContain('廣告模式已開');
	});
});
