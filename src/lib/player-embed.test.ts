import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression guard for Hector's 2026-11-20 iPad incident: an UNSANDBOXED
// provider embed redirected the whole Safari tab to an ad host
// (ccads.adsboosters.xyz, a casino ad). Hector's P0 ruling
// (REAL-CATALOGUE-BRIEF.md §1): opening a title must NEVER redirect or
// pop-under to an ad, and a provider that only plays when allowed to
// serve popunders is not acceptable. This REVERSES the 2026-11-18 guard,
// which pinned the vulnerable no-sandbox contract after VidLink rendered
// "Please Disable Sandbox". The vitest suite runs in a node environment
// (no DOM / testing-library in this repo), and the iframe only renders
// after the resolver fills `src`, so this asserts the contract on the
// component source itself — the exact place a regression would land.
const source = readFileSync(new URL('./components/Player.svelte', import.meta.url), 'utf8');
const providersSource = readFileSync(new URL('./providers.ts', import.meta.url), 'utf8');
const iframeTag = source.slice(source.indexOf('<iframe'), source.indexOf('>', source.indexOf('<iframe')) + 1);

// Tokens that would let an embed navigate the top tab or open popups —
// the exact capabilities behind the 2026-11-20 incident. They must never
// appear in the player or the provider registry.
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

	it('is sandboxed with exactly the safe token set (P0 contract)', () => {
		expect(iframeTag).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"');
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
