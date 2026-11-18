import { parsePersonal } from './personal';
import type { PersonalState } from './types';

/**
 * Client for the openmovies-api Worker (auth codes + per-user sync + analytics).
 * Every call is best-effort: if PUBLIC_API_BASE is unset or the API is down,
 * the app keeps working on the on-device personal layer. Watching NEVER
 * depends on this module.
 */
const base = (): string =>
	(typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.PUBLIC_API_BASE) || '';

export const apiConfigured = (): boolean => base().length > 0;

/** The API base URL ('' when unconfigured). Used by the resolver layer. */
export const apiBase = base;

async function call(path: string, init?: RequestInit): Promise<Response | null> {
	if (!apiConfigured()) return null;
	try {
		return await fetch(`${base()}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
	} catch {
		return null;
	}
}

export type RequestCodeResult =
	| { ok: true }
	| { ok: false; reason: 'not-configured' | 'mail-not-configured' | 'rate-limited' | 'error' };

export async function requestCode(email: string): Promise<RequestCodeResult> {
	const res = await call('/auth/request-code', { method: 'POST', body: JSON.stringify({ email }) });
	if (!res) return { ok: false, reason: apiConfigured() ? 'error' : 'not-configured' };
	if (res.ok) return { ok: true };
	if (res.status === 501) return { ok: false, reason: 'mail-not-configured' };
	if (res.status === 429) return { ok: false, reason: 'rate-limited' };
	return { ok: false, reason: 'error' };
}

export async function verifyCode(email: string, code: string): Promise<{ token: string } | null> {
	const res = await call('/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
	if (!res || !res.ok) return null;
	const data = (await res.json().catch(() => null)) as { token?: string } | null;
	return data?.token ? { token: data.token } : null;
}

export async function fetchRemoteState(token: string): Promise<PersonalState | null> {
	const res = await call('/me/state', { headers: { Authorization: `Bearer ${token}` } });
	if (!res || !res.ok) return null;
	const data = await res.json().catch(() => null);
	return data ? parsePersonal((data as { state?: unknown }).state) : null;
}

export async function pushRemoteState(token: string, state: PersonalState): Promise<boolean> {
	const res = await call('/me/state', {
		method: 'PUT',
		headers: { Authorization: `Bearer ${token}` },
		body: JSON.stringify({ state })
	});
	return !!res?.ok;
}

export interface ProviderHealthInfo {
	id: string;
	/** `ok` = the Worker's edge probe got a definitive HTTP answer from
	 * the host. `ok: false` = the probe was inconclusive (it runs from
	 * Cloudflare's network, a vantage users never have) — it must only
	 * ever surface as "unverified", never "down". See providerMarker. */
	ok: boolean;
	status: number | null;
	latencyMs: number;
}

/** Provider health from the Worker (itself edge-cached, failures negative-
 * cached). Best-effort: null when the API is unconfigured or unreachable,
 * in which case the player simply shows no markers. */
export async function fetchProviderHealth(): Promise<ProviderHealthInfo[] | null> {
	const res = await call('/providers/health');
	if (!res || !res.ok) return null;
	const data = (await res.json().catch(() => null)) as { providers?: ProviderHealthInfo[] } | null;
	return data?.providers ?? null;
}

/** Anonymous, aggregate product analytics — what Hector asked for: analysis
 * only, never sold, no third-party trackers. Sends a title id + action +
 * day, nothing personal, and only when the API is configured. */
export function trackEvent(action: 'play' | 'detail' | 'search' | 'download', titleId?: number): void {
	void call('/analytics/event', { method: 'POST', body: JSON.stringify({ action, titleId }) });
}
