import { browser } from '$app/environment';
import { loadPersonal, markServerSwitched, markWatched, recordDownload, savePersonal, settleFinished, toggleLiked, toggleWatchlist, upsertResume } from './personal';
import { fetchRemoteState, pushRemoteState } from './api';
import { emptyPersonal, type PersonalState, type ResumeEntry } from './types';

const SESSION_KEY = 'openmovies:session:v1';

export interface Session {
	email: string;
	token: string;
}

/**
 * Runes singleton for the personal layer + session (OpenMusic store pattern).
 * userId = signed-in email, else 'guest'. Guest data lives on-device only;
 * signing in merges guest data into the account and syncs to the API Worker
 * so watched/liked/resume/watchlist follow the person across domains.
 */
class AppStore {
	personal = $state<PersonalState>(emptyPersonal());
	session = $state<Session | null>(null);
	loaded = $state(false);

	get userId(): string {
		return this.session?.email ?? 'guest';
	}
	get signedIn(): boolean {
		return !!this.session;
	}

	load() {
		if (!browser || this.loaded) return;
		try {
			const raw = localStorage.getItem(SESSION_KEY);
			if (raw) this.session = JSON.parse(raw) as Session;
		} catch { /* no session */ }
		this.personal = loadPersonal(localStorage, this.userId);
		this.loaded = true;
	}

	private persist() {
		if (!browser) return;
		savePersonal(localStorage, this.userId, this.personal);
		if (this.session) void pushRemoteState(this.session.token, this.personal);
	}

	private apply(next: PersonalState) {
		this.personal = settleFinished(next);
		this.persist();
	}

	toggleLiked(id: number) { this.apply(toggleLiked(this.personal, id)); }
	toggleWatchlist(id: number) { this.apply(toggleWatchlist(this.personal, id)); }
	markWatched(id: number) { this.apply(markWatched(this.personal, id)); }
	recordDownload(id: number) { this.apply(recordDownload(this.personal, id)); }
	recordResume(e: ResumeEntry) { this.apply(upsertResume(this.personal, e)); }
	noteServerSwitch() { this.apply(markServerSwitched(this.personal)); }

	async signIn(email: string, token: string) {
		if (!browser) return;
		const guest = this.personal;
		this.session = { email, token };
		try { localStorage.setItem(SESSION_KEY, JSON.stringify(this.session)); } catch { /* ignore */ }
		const remote = await fetchRemoteState(token);
		const merged = remote
			? {
					liked: [...new Set([...remote.liked, ...guest.liked])],
					watchlist: [...new Set([...remote.watchlist, ...guest.watchlist])],
					watched: [...new Set([...remote.watched, ...guest.watched])],
					downloads: [...new Set([...(remote.downloads ?? []), ...guest.downloads])],
					resume: { ...guest.resume, ...remote.resume },
					flags: { serverSwitched: remote.flags.serverSwitched || guest.flags.serverSwitched }
				}
			: guest;
		this.personal = settleFinished(merged);
		savePersonal(localStorage, email, this.personal);
		void pushRemoteState(token, this.personal);
	}

	signOut() {
		if (!browser) return;
		this.session = null;
		try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
		this.personal = loadPersonal(localStorage, 'guest');
	}
}

export const store = new AppStore();
