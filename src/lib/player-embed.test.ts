import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression guard for Hector's 2026-11-18 iPad report: VidLink rendered
// "Please Disable Sandbox" because the provider embed iframe carried a
// `sandbox` attribute. Embed providers refuse to run sandboxed, so the
// player iframe must NEVER carry one. The vitest suite runs in a node
// environment (no DOM / testing-library in this repo), and the iframe only
// renders after the resolver fills `src`, so this asserts the contract on
// the component source itself — the exact place a regression would land.
const source = readFileSync(new URL('./components/Player.svelte', import.meta.url), 'utf8');
const iframeTag = source.slice(source.indexOf('<iframe'), source.indexOf('>', source.indexOf('<iframe')) + 1);

describe('provider embed iframe (Player.svelte)', () => {
	it('exists and points at the resolved source', () => {
		expect(iframeTag).toContain('<iframe');
		expect(iframeTag).toContain('src={src}');
	});

	it('has NO sandbox attribute — providers refuse sandboxed embeds', () => {
		expect(iframeTag).not.toContain('sandbox');
	});

	it('grants the playback permissions embeds need', () => {
		expect(iframeTag).toContain('allow="autoplay; fullscreen; encrypted-media; picture-in-picture"');
		expect(iframeTag).toContain('allowfullscreen');
	});

	it('keeps the origin-only referrer policy', () => {
		expect(iframeTag).toContain('referrerpolicy="origin"');
	});
});
