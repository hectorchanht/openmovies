/** Core domain types for OpenMovies. TMDB-shaped on purpose: the demo dataset
 * and the live TMDB adapter both produce these, so swapping the data source
 * never touches the UI. */
export type MediaType = 'movie' | 'tv';

export interface Episode {
	season: number;
	episode: number;
	title: string;
	runtimeMin: number;
}

export interface Title {
	/** TMDB id. Demo rows carry real TMDB ids of well-known titles so embed
	 * providers resolve them; metadata text is our own summary copy. */
	id: number;
	type: MediaType;
	name: string;
	year: number;
	genres: string[];
	rating: number; // 0..10, one decimal
	overview: string;
	runtimeMin?: number; // movies
	seasons?: number; // tv
	episodes?: Episode[]; // tv (demo subset / TMDB season 1)
	/** CSS gradient used as poster art when no TMDB poster is available. */
	art: string;
	posterPath?: string | null; // TMDB /w500 path when the live adapter supplied it
	backdropPath?: string | null;
}

export interface ResumeEntry {
	titleId: number;
	type: MediaType;
	season?: number;
	episode?: number;
	/** seconds watched */
	positionSec: number;
	/** seconds total (0 = unknown) */
	durationSec: number;
	updatedAt: number; // epoch ms
}

export interface PersonalState {
	liked: number[];
	watchlist: number[];
	watched: number[];
	/** Titles the user started a download for (the file itself lives on their device). */
	downloads: number[];
	resume: Record<string, ResumeEntry>; // key: `${type}:${id}` or `${type}:${id}:${s}:${e}`
	flags: { serverSwitched: boolean };
}

export const emptyPersonal = (): PersonalState => ({
	liked: [],
	watchlist: [],
	watched: [],
	downloads: [],
	resume: {},
	flags: { serverSwitched: false }
});

export const resumeKey = (t: { type: MediaType; id: number; season?: number; episode?: number }): string =>
	t.type === 'tv' && t.season != null && t.episode != null
		? `${t.type}:${t.id}:${t.season}:${t.episode}`
		: `${t.type}:${t.id}`;

/** 0..1 watched fraction for progress bars; 0 when duration unknown. */
export const progressOf = (e: ResumeEntry): number =>
	e.durationSec > 0 ? Math.min(1, Math.max(0, e.positionSec / e.durationSec)) : 0;

/** A title counts as "in progress" for Continue Watching between 2% and 95%. */
export const isInProgress = (e: ResumeEntry): boolean => {
	const p = progressOf(e);
	return p >= 0.02 && p < 0.95;
};

export type Achievement = { id: string; label: string; earned: boolean };

/** Achievements are derived, never stored — they can never drift from the data. */
export function achievementsFor(state: PersonalState): Achievement[] {
	const resumeCount = Object.keys(state.resume).length;
	return [
		{ id: 'first-play', label: 'First Play', earned: resumeCount >= 1 || state.watched.length >= 1 },
		{ id: 'server-switcher', label: 'Server Switcher', earned: state.flags.serverSwitched },
		{ id: 'resume-master', label: 'Resume Master', earned: Object.values(state.resume).some((e) => progressOf(e) >= 0.5) },
		{ id: 'collector', label: 'Collector', earned: state.watchlist.length >= 3 },
		{ id: 'critic', label: 'Liked Five', earned: state.liked.length >= 5 }
	];
}
