import { providerById } from './providers';
import { apiBase } from './api';

/**
 * Client resolution layer — the client twin of the API Worker's edge cache.
 * Resolution results (embed/download URLs for a provider + title) are
 * memoized in-session AND persisted in localStorage for 6h (mirroring the
 * Worker's RESOLVE_TTL_S), so Continue Watching, episode hops and server
 * switches never re-resolve what is already known. The Worker endpoint
 * (/resolve) is tried first when the API is configured — its Cloudflare
 * edge cache serves the whole PoP; any failure falls back to the local
 * provider registry, so watching never depends on the API being up.
 * Keys carry only anonymous resolver params (provider/type/id/season/
 * episode) — no per-user data, same doctrine as the server cache.
 */
export interface ResolvedSource {
	provider: string;
	embedUrl: string;
	downloadUrl: string | null;
	progressEvents: boolean;
	verified: boolean;
	fromCache: boolean;
}

export interface ResolveTarget {
	id: number;
	type: 'movie' | 'tv';
	season?: number;
	episode?: number;
}

/** 6h — mirrors the Worker's RESOLVE_TTL_S. */
export const RESOLVE_MEMO_TTL_MS = 21_600_000;
const LS_KEY = 'openmovies:resolve:v1';

export function memoKey(providerId: string, t: ResolveTarget): string {
	return `${providerId}:${t.type}:${t.id}:${t.type === 'tv' ? (t.season ?? 1) : 0}:${t.type === 'tv' ? (t.episode ?? 1) : 0}`;
}

export interface MemoStorage {
	getItem(k: string): string | null;
	setItem(k: string, v: string): void;
}

interface MemoEntry {
	payload: Omit<ResolvedSource, 'fromCache'>;
	exp: number;
}

const session = new Map<string, MemoEntry>();

function defaultStorage(): MemoStorage | null {
	try {
		return typeof localStorage !== 'undefined' ? localStorage : null;
	} catch {
		return null;
	}
}

function readStored(storage: MemoStorage | null): Record<string, MemoEntry> {
	if (!storage) return {};
	try {
		const raw = storage.getItem(LS_KEY);
		return raw ? (JSON.parse(raw) as Record<string, MemoEntry>) : {};
	} catch {
		return {};
	}
}

/** Read one memo entry (session first, then localStorage). Expired entries are misses. Pure given (storage, now). */
export function readMemo(
	key: string,
	now: number,
	storage: MemoStorage | null = defaultStorage()
): Omit<ResolvedSource, 'fromCache'> | null {
	const s = session.get(key);
	if (s && s.exp > now) return s.payload;
	if (s) session.delete(key);
	const stored = readStored(storage)[key];
	if (stored && stored.exp > now) {
		session.set(key, stored);
		return stored.payload;
	}
	return null;
}

/** Write one memo entry to session + localStorage (best-effort; quota errors are ignored). */
export function writeMemo(
	key: string,
	payload: Omit<ResolvedSource, 'fromCache'>,
	now: number,
	ttlMs: number = RESOLVE_MEMO_TTL_MS,
	storage: MemoStorage | null = defaultStorage()
): void {
	const entry: MemoEntry = { payload, exp: now + ttlMs };
	session.set(key, entry);
	if (!storage) return;
	try {
		const all = readStored(storage);
		// prune expired siblings so the record cannot grow without bound
		for (const k of Object.keys(all)) if (all[k].exp <= now) delete all[k];
		all[key] = entry;
		storage.setItem(LS_KEY, JSON.stringify(all));
	} catch {
		/* persistence is an optimisation, never a requirement */
	}
}

/** Test seam: clear the in-session memo. */
export function clearSessionMemo(): void {
	session.clear();
}

export interface ResolveOpts {
	apiBase?: string;
	fetchFn?: typeof fetch;
	now?: number;
	storage?: MemoStorage | null;
}

/**
 * Resolve the playable source for one provider + title:
 * memo -> Worker /resolve (edge-cached) -> local registry fallback.
 */
export async function resolveSource(providerId: string, t: ResolveTarget, opts: ResolveOpts = {}): Promise<ResolvedSource> {
	const now = opts.now ?? Date.now();
	const storage = opts.storage !== undefined ? opts.storage : defaultStorage();
	const key = memoKey(providerId, t);
	const memo = readMemo(key, now, storage);
	if (memo) return { ...memo, fromCache: true };

	const base = opts.apiBase !== undefined ? opts.apiBase : apiBase();
	const fetchFn = opts.fetchFn ?? fetch;
	if (base) {
		try {
			const q = new URLSearchParams({
				provider: providerId,
				type: t.type,
				id: String(t.id),
				season: String(t.season ?? 1),
				episode: String(t.episode ?? 1)
			});
			const res = await fetchFn(`${base}/resolve?${q}`);
			if (res.ok) {
				const data = (await res.json()) as Omit<ResolvedSource, 'fromCache'>;
				writeMemo(key, data, now, RESOLVE_MEMO_TTL_MS, storage);
				return { ...data, fromCache: false };
			}
		} catch {
			/* fall through to the local registry */
		}
	}

	const prov = providerById(providerId);
	const local: Omit<ResolvedSource, 'fromCache'> = {
		provider: prov.id,
		embedUrl: prov.build({ id: t.id, type: t.type, season: t.season, episode: t.episode }),
		downloadUrl: prov.buildDownload
			? prov.buildDownload({ id: t.id, type: t.type, season: t.season, episode: t.episode })
			: null,
		progressEvents: prov.progressEvents,
		verified: prov.verified
	};
	writeMemo(key, local, now, RESOLVE_MEMO_TTL_MS, storage);
	return { ...local, fromCache: false };
}
