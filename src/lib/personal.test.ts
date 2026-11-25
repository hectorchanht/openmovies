import { describe, expect, it } from 'vitest';
import {
	continueWatching, loadPersonal, markWatched, parsePersonal, savePersonal,
	toggleLiked, toggleWatchlist, upsertResume
} from './personal';
import { achievementsFor, emptyPersonal } from './types';

const entry = (over = {}) => ({
	titleId: 27205, type: 'movie' as const, positionSec: 1800, durationSec: 5400, updatedAt: 1000, ...over
});

describe('personal layer', () => {
	it('toggles liked and watchlist on and off', () => {
		let s = emptyPersonal();
		s = toggleLiked(s, 1); s = toggleWatchlist(s, 2);
		expect(s.liked).toEqual([1]); expect(s.watchlist).toEqual([2]);
		s = toggleLiked(s, 1);
		expect(s.liked).toEqual([]);
	});
	it('ignores resume points under 5 seconds', () => {
		const s = upsertResume(emptyPersonal(), entry({ positionSec: 3 }));
		expect(Object.keys(s.resume)).toHaveLength(0);
	});
	it('Continue Watching keeps 2%..95% only, newest first', () => {
		let s = emptyPersonal();
		s = upsertResume(s, entry({ positionSec: 2700, updatedAt: 2000 })); // 50%
		s = upsertResume(s, entry({ titleId: 155, positionSec: 5300, updatedAt: 3000 })); // 98% -> out
		s = upsertResume(s, entry({ titleId: 496243, positionSec: 200, updatedAt: 4000 })); // ~4% -> in
		const cw = continueWatching(s);
		expect(cw.map((e) => e.titleId)).toEqual([496243, 27205]);
	});
	it('markWatched is idempotent and achievements derive from state', () => {
		let s = markWatched(markWatched(emptyPersonal(), 7), 7);
		expect(s.watched).toEqual([7]);
		s = toggleWatchlist(toggleWatchlist(toggleWatchlist(s, 1), 2), 3);
		const a = achievementsFor(s);
		expect(a.find((x) => x.id === 'collector')?.earned).toBe(true);
		expect(a.find((x) => x.id === 'first-play')?.earned).toBe(true);
	});
	it('round-trips through storage and survives corrupt JSON', () => {
		const mem = new Map<string, string>();
		const storage = {
			getItem: (k: string) => mem.get(k) ?? null,
			setItem: (k: string, v: string) => void mem.set(k, v)
		};
		const s = toggleLiked(emptyPersonal(), 42);
		savePersonal(storage, 'a@b.c', s);
		expect(loadPersonal(storage, 'a@b.c').liked).toEqual([42]);
		expect(loadPersonal(storage, 'other@b.c').liked).toEqual([]); // per-user keying
		mem.set('openmovies:personal:v1:a@b.c', '{broken');
		expect(loadPersonal(storage, 'a@b.c')).toEqual(emptyPersonal());
	});
	it('parsePersonal drops junk fields from untrusted sync payloads', () => {
		const s = parsePersonal({ liked: [1, 'x', 2], resume: { bad: { nope: 1 } }, flags: { serverSwitched: 1 } });
		expect(s.liked).toEqual([1, 2]);
		expect(Object.keys(s.resume)).toHaveLength(0);
		expect(s.flags.serverSwitched).toBe(false);
	});
});

describe('downloads', () => {
	it('recordDownload is idempotent and parsePersonal keeps downloads', async () => {
		const { recordDownload } = await import('./personal');
		let s = recordDownload(emptyPersonal(), 42);
		s = recordDownload(s, 42);
		expect(s.downloads).toEqual([42]);
		expect(parsePersonal(JSON.parse(JSON.stringify(s))).downloads).toEqual([42]);
		expect(parsePersonal({ downloads: 'nope' }).downloads).toEqual([]);
	});
});
