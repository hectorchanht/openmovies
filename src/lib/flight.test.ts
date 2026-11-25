import { describe, expect, it } from 'vitest';
import { flightEmbedUrlFor, warmEmbed } from './flight';

describe('cover-flight — embed warming (ruling 4)', () => {
	it('warms the DEFAULT provider (BingeAPI) embed URL, built directly — the exact URL the watch page loads', () => {
		expect(flightEmbedUrlFor({ id: 577922, type: 'movie' })).toBe(
			'https://bingeapi.st/embed/movie/577922?color=e8590c&autoplay=1'
		);
		expect(flightEmbedUrlFor({ id: 1396, type: 'tv' })).toBe(
			'https://bingeapi.st/embed/tv/1396/1/1?color=e8590c&autoplay=1'
		);
		expect(flightEmbedUrlFor({ id: 1396, type: 'tv' }, { season: 2, episode: 3 })).toBe(
			'https://bingeapi.st/embed/tv/1396/2/3?color=e8590c&autoplay=1'
		);
	});
	it('warmEmbed loads the URL in one hidden offscreen frame', () => {
		const frames: Record<string, unknown>[] = [];
		const doc = {
			createElement: () => {
				const f: Record<string, unknown> = {
					style: { cssText: '' },
					setAttribute: () => {},
					remove: () => {}
				};
				frames.push(f);
				return f;
			},
			body: { appendChild: () => {} }
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		warmEmbed('https://bingeapi.st/embed/movie/577922?color=e8590c&autoplay=1', doc as any);
		expect(frames).toHaveLength(1);
		expect(frames[0].src).toContain('bingeapi.st/embed/movie/577922');
	});
});
