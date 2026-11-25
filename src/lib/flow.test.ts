import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// One-tap autoplay flow (Hector 2026-11-24): tap a title once -> straight
// to its watch page -> player loads and plays by itself. No intermediate
// detail page, no manual Play click, and for BingeAPI no resolver
// network round-trip in between (direct-connect; only playback
// behaviour is recorded). Source-level contract, same style as
// player-embed.test.ts (node test env, no DOM).
const card = readFileSync(new URL('./components/PosterCard.svelte', import.meta.url), 'utf8');
const player = readFileSync(new URL('./components/Player.svelte', import.meta.url), 'utf8');
const providers = readFileSync(new URL('./providers.ts', import.meta.url), 'utf8');

describe('one-tap play flow', () => {
	it('poster cards link straight to the watch page, not the detail page', () => {
		expect(card).toContain('href={`/watch/${title.id}?type=${title.type}`}');
		expect(card).not.toContain('href={`/title/');
	});
	it('BingeAPI embeds carry explicit autoplay=1', () => {
		expect(providers).toContain('autoplay=1');
	});
	it('the player direct-connects BingeAPI locally instead of waiting on the resolver', () => {
		expect(player).toContain("if (pid === 'bingeapi')");
		expect(player).toContain("src = providerById('bingeapi').build(target);");
	});
});
