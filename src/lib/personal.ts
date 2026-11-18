import { emptyPersonal, resumeKey, type PersonalState, type ResumeEntry } from './types';

/**
 * Personal-layer logic — pure functions over PersonalState.
 * The account exists ONLY for this: watched / liked / resume / watchlist.
 * Watching itself never touches this module and never needs an account.
 * State is kept per user: storage/sync keys are namespaced by user id
 * (email when signed in, 'guest' otherwise) so data follows the person,
 * never the domain.
 */

export const storageKeyFor = (userId: string): string => `openmovies:personal:v1:${userId}`;

const toggleIn = (list: number[], id: number): number[] =>
	list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export const toggleLiked = (s: PersonalState, id: number): PersonalState => ({ ...s, liked: toggleIn(s.liked, id) });
export const toggleWatchlist = (s: PersonalState, id: number): PersonalState => ({
	...s,
	watchlist: toggleIn(s.watchlist, id)
});
export const markWatched = (s: PersonalState, id: number): PersonalState =>
	s.watched.includes(id) ? s : { ...s, watched: [...s.watched, id] };

/** Record that the user started a download of this title (idempotent). */
export const recordDownload = (s: PersonalState, id: number): PersonalState =>
	s.downloads.includes(id) ? s : { ...s, downloads: [...s.downloads, id] };

/** Upsert a resume point. Positions <5s are ignored (accidental opens). */
export function upsertResume(s: PersonalState, e: ResumeEntry): PersonalState {
	if (e.positionSec < 5) return s;
	// ResumeEntry carries titleId; resumeKey wants the Title-shaped {id} — map it
	// explicitly (passing `e` directly silently keyed every entry `movie:undefined`).
	const key = resumeKey({ type: e.type, id: e.titleId, season: e.season, episode: e.episode });
	return { ...s, resume: { ...s.resume, [key]: e } };
}

/** Finished titles (>=95%) leave Continue Watching and land in Watched. */
export function settleFinished(s: PersonalState): PersonalState {
	let next = s;
	for (const e of Object.values(s.resume)) {
		if (e.durationSec > 0 && e.positionSec / e.durationSec >= 0.95) next = markWatched(next, e.titleId);
	}
	return next;
}

export const markServerSwitched = (s: PersonalState): PersonalState =>
	s.flags.serverSwitched ? s : { ...s, flags: { ...s.flags, serverSwitched: true } };

/** Continue Watching rows, most recently touched first. */
export function continueWatching(s: PersonalState): ResumeEntry[] {
	return Object.values(s.resume)
		.filter((e) => e.durationSec > 0 && e.positionSec / e.durationSec >= 0.02 && e.positionSec / e.durationSec < 0.95)
		.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Validate + normalise untrusted JSON (localStorage or server sync) into a PersonalState. */
export function parsePersonal(raw: unknown): PersonalState {
	if (typeof raw !== 'object' || raw === null) return emptyPersonal();
	const r = raw as Record<string, unknown>;
	const numList = (v: unknown): number[] =>
		Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
	const resume: Record<string, ResumeEntry> = {};
	if (typeof r.resume === 'object' && r.resume !== null) {
		for (const [k, v] of Object.entries(r.resume as Record<string, unknown>)) {
			if (typeof v === 'object' && v !== null) {
				const e = v as Record<string, unknown>;
				if (typeof e.titleId === 'number' && typeof e.positionSec === 'number') {
					resume[k] = {
						titleId: e.titleId,
						type: e.type === 'tv' ? 'tv' : 'movie',
						season: typeof e.season === 'number' ? e.season : undefined,
						episode: typeof e.episode === 'number' ? e.episode : undefined,
						positionSec: e.positionSec,
						durationSec: typeof e.durationSec === 'number' ? e.durationSec : 0,
						updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : 0
					};
				}
			}
		}
	}
	const flags = (typeof r.flags === 'object' && r.flags !== null ? r.flags : {}) as Record<string, unknown>;
	return {
		liked: numList(r.liked),
		watchlist: numList(r.watchlist),
		watched: numList(r.watched),
		downloads: numList(r.downloads),
		resume,
		flags: { serverSwitched: flags.serverSwitched === true }
	};
}

export function loadPersonal(storage: Pick<Storage, 'getItem'>, userId: string): PersonalState {
	try {
		const raw = storage.getItem(storageKeyFor(userId));
		return raw ? parsePersonal(JSON.parse(raw)) : emptyPersonal();
	} catch {
		return emptyPersonal();
	}
}

export function savePersonal(storage: Pick<Storage, 'setItem'>, userId: string, s: PersonalState): void {
	try {
		storage.setItem(storageKeyFor(userId), JSON.stringify(s));
	} catch {
		/* storage full/blocked — personal layer is best-effort, watching never breaks */
	}
}
