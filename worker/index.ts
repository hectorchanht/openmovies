/**
 * openmovies-api — the only server OpenMovies has.
 * Routes:
 *   POST /auth/request-code  {email}        -> emails a 6-digit code (Resend)
 *   POST /auth/verify        {email, code}  -> {token} (HMAC session, 30d)
 *   GET  /me/state           Bearer token   -> {state}  (watched/liked/resume/watchlist)
 *   PUT  /me/state           Bearer token   -> stores the personal state JSON
 *   POST /analytics/event    {action, titleId?} -> anonymous aggregate counter
 *   GET  /resolve?provider&type&id&season&episode -> embed/download URLs (edge-cached 6h)
 *   GET  /providers/health   -> provider probe round (cached 5m, failures 2m negative)
 *   GET  /tmdb/:type/:id     -> TMDB metadata proxy (cached 24h, failures 2m negative; needs TMDB_API_KEY)
 *   GET  /health
 *
 * Privacy contract (mirrors /privacy on the site): personal state belongs to
 * the account and follows the person across domains; analytics are anonymous
 * aggregates for product analysis only and are never sold.
 */
export interface Env {
	DB: D1Like;
	AUTH_SECRET: string;
	RESEND_API_KEY?: string;
	MAIL_FROM?: string;
	/** Optional: enables the /tmdb/* metadata proxy (long-TTL edge cached). */
	TMDB_API_KEY?: string;
}

export interface D1Like {
	prepare(sql: string): {
		bind(...v: unknown[]): {
			run(): Promise<unknown>;
			first<T = Record<string, unknown>>(): Promise<T | null>;
		};
	};
}

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;

const enc = new TextEncoder();
async function hmac(secret: string, msg: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const sha256 = async (msg: string): Promise<string> => {
	const d = await crypto.subtle.digest('SHA-256', enc.encode(msg));
	return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const makeToken = async (secret: string, email: string, now: number): Promise<string> => {
	const exp = now + TOKEN_TTL_MS;
	const body = `${email}.${exp}`;
	return `${body}.${await hmac(secret, body)}`;
};

export async function readToken(secret: string, token: string, now: number): Promise<string | null> {
	const parts = token.split('.');
	if (parts.length < 3) return null;
	const sig = parts.pop()!;
	const exp = Number(parts.pop());
	const email = parts.join('.');
	if (!email || !Number.isFinite(exp) || exp < now) return null;
	const expect = await hmac(secret, `${email}.${exp}`);
	// constant-time-ish compare (lengths are fixed hex)
	if (expect.length !== sig.length) return null;
	let diff = 0;
	for (let i = 0; i < expect.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
	return diff === 0 ? email : null;
}

const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const jsonH = (data: unknown, status: number, headers: Record<string, string>): Response =>
	new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/* ------------------------------------------------------------------ *
 * Resolver response caching — Cloudflare Cache API (`caches.default`),
 * mirroring OpenMusic's proven edge-cache discipline (2026-11-18):
 *  - edge Cache API, NOT KV (OpenMusic evaluated KV on 2026-11-16 and
 *    stayed with Cache API; nothing about OpenMovies changes that math —
 *    resolver payloads are tiny, anonymous and PoP-local by nature).
 *  - Cache keys are synthetic OWN-ORIGIN URLs built ONLY from anonymous
 *    resolver params (provider/type/id/season/episode, TMDB type/id).
 *    Never a secret (the TMDB key lives in the upstream URL only), never
 *    per-user data — the cache is shared by everyone, which matches the
 *    data doctrine: no tracking aimed at specific users.
 *  - TTL is a property of the PAYLOAD: positives get long TTLs (embed URL
 *    patterns are stable for days; TMDB metadata changes slowly), while
 *    failures get a BRIEF negative TTL so a dead provider is not hammered
 *    yet self-heals in minutes and server-switching stays instant.
 *  - Caching is best-effort: any Cache API error degrades to a plain
 *    compute/fetch, never to a 500.
 * ------------------------------------------------------------------ */

/** Narrowed subset of the Cloudflare Cache API we use (DOM lib lacks `caches.default`). */
export interface EdgeCacheLike {
	match(request: Request): Promise<Response | undefined>;
	put(request: Request, response: Response): Promise<void>;
	delete(request: Request): Promise<boolean>;
}

/** The `caches.default` edge cache, or null where the Cache API is absent (tests, plain node). */
export function edgeCache(): EdgeCacheLike | null {
	const c = (globalThis as unknown as { caches?: { default?: EdgeCacheLike } }).caches;
	return c?.default ?? null;
}

/** Cache-key namespace version. A payload-shape change bumps this, never migrates in place. */
export const OM_CACHE_VERSION = '1';
/** 6h — embed/download URL patterns are stable; provider churn is day-scale. */
export const RESOLVE_TTL_S = 21_600;
/** 5 min — provider health when every provider answers. */
export const HEALTH_TTL_S = 300;
/** 2 min — negative entries (a failed probe / failed TMDB fill). Brief on purpose: self-heals fast, stops hammering. */
export const NEGATIVE_TTL_S = 120;
/** 24h — TMDB metadata changes slowly (Hector's 2026-10-21 caching principle). */
export const TMDB_TTL_S = 86_400;

const CACHE_ORIGIN = 'https://openmovies-api.dawnstudio.app';

export interface ResolveParams {
	provider: string;
	type: 'movie' | 'tv';
	id: number;
	season: number;
	episode: number;
}

export function resolveCacheKey(p: ResolveParams): Request {
	return new Request(
		`${CACHE_ORIGIN}/_cache/v${OM_CACHE_VERSION}/resolve?provider=${encodeURIComponent(p.provider)}&type=${p.type}&id=${p.id}&s=${p.season}&e=${p.episode}`
	);
}

export function healthCacheKey(): Request {
	return new Request(`${CACHE_ORIGIN}/_cache/v${OM_CACHE_VERSION}/providers-health`);
}

export function tmdbCacheKey(type: 'movie' | 'tv', id: number): Request {
	return new Request(`${CACHE_ORIGIN}/_cache/v${OM_CACHE_VERSION}/tmdb/${type}/${id}`);
}

/** Best-effort cache read: returns the parsed JSON on a hit, undefined on miss/error. */
export async function readCachedJson(cache: EdgeCacheLike | null, key: Request): Promise<unknown> {
	if (!cache) return undefined;
	try {
		const hit = await cache.match(key);
		if (!hit) return undefined;
		return await hit.json();
	} catch {
		return undefined;
	}
}

/** Best-effort cache write of a FRESH response (explicit two-header allow-list, like OpenMusic). */
export async function writeCachedJson(
	cache: EdgeCacheLike | null,
	key: Request,
	value: unknown,
	ttlS: number
): Promise<void> {
	if (!cache) return;
	try {
		await cache.put(
			key,
			new Response(JSON.stringify(value), {
				status: 200,
				headers: { 'content-type': 'application/json', 'Cache-Control': `public, max-age=${ttlS}` }
			})
		);
	} catch {
		/* a failed write only costs the next request a re-fill */
	}
}

/**
 * Server mirror of the client provider registry (src/lib/providers.ts).
 * The two MUST stay in sync — the worker is deployed as a single module
 * (scripts/deploy-api.py), so it cannot import the client file. `host` is
 * the health-probe target; demo has none (it is our own simulated player).
 */
interface ServerProvider {
	id: string;
	label: string;
	capabilities: ('stream' | 'download')[];
	progressEvents: boolean;
	verified: boolean;
	host: string | null;
	build: (p: ResolveParams) => string;
	buildDownload?: (p: ResolveParams) => string;
}

export const SERVER_PROVIDERS: ServerProvider[] = [
	{
		id: 'bingeapi',
		label: 'Server 1 · BingeAPI',
		capabilities: ['stream'],
		progressEvents: true,
		verified: true,
		host: 'bingeapi.st',
		build: ({ id, type, season, episode }) =>
			type === 'movie'
				? `https://bingeapi.st/embed/movie/${id}?color=e8590c&autoplay=1`
				: `https://bingeapi.st/embed/tv/${id}/${season}/${episode}?color=e8590c&autoplay=1`
	},
	{
		id: 'embedwave',
		label: 'Server 2 · EmbedWave',
		capabilities: ['stream'],
		progressEvents: false,
		verified: true,
		host: 'embedwave.cc',
		build: ({ id, type, season, episode }) =>
			type === 'movie'
				? `https://embedwave.cc/embed/movie/${id}`
				: `https://embedwave.cc/embed/tv/${id}/${season}/${episode}`
	},
	{
		id: 'demo',
		label: 'Server 3 · Demo Player',
		capabilities: ['stream'],
		progressEvents: false,
		verified: true,
		host: null,
		build: () => 'about:blank'
	},
	{
		id: 'vidlink',
		label: 'Server 4 · VidLink · 有廣告 Ads',
		capabilities: ['stream'],
		progressEvents: true,
		verified: true,
		host: 'vidlink.pro',
		build: ({ id, type, season, episode }) =>
			type === 'movie'
				? `https://vidlink.pro/movie/${id}?primaryColor=e8590c`
				: `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=e8590c`
	},
	{
		id: 'vidfast',
		label: 'Server 5 · VidFast · 有廣告 Ads',
		capabilities: ['stream'],
		progressEvents: false,
		verified: true,
		host: 'vidfast.vc',
		build: ({ id, type, season, episode }) =>
			type === 'movie' ? `https://vidfast.vc/movie/${id}` : `https://vidfast.vc/tv/${id}/${season}/${episode}`
	}
];

export interface ResolvePayload {
	provider: string;
	label: string;
	embedUrl: string;
	downloadUrl: string | null;
	capabilities: ('stream' | 'download')[];
	progressEvents: boolean;
	verified: boolean;
}

/** Pure resolution: provider + anonymous params -> payload, or null for an unknown provider. */
export function resolvePayloadFor(p: ResolveParams): ResolvePayload | null {
	const prov = SERVER_PROVIDERS.find((x) => x.id === p.provider);
	if (!prov) return null;
	return {
		provider: prov.id,
		label: prov.label,
		embedUrl: prov.build(p),
		downloadUrl: prov.buildDownload ? prov.buildDownload(p) : null,
		capabilities: prov.capabilities,
		progressEvents: prov.progressEvents,
		verified: prov.verified
	};
}

export interface ProviderHealth {
	id: string;
	/**
	 * `ok` means ONLY that this edge probe got a definitive HTTP answer
	 * from the host (status < 500). `ok: false` means the probe was
	 * INCONCLUSIVE — DNS/connection failure, timeout, or a 5xx produced
	 * by an intermediary (e.g. Cloudflare's 530 in front of an origin it
	 * cannot reach). It is NOT evidence the host is down for end users:
	 * the probe runs from Cloudflare's network, which providers often
	 * block while real devices connect fine. Clients must surface a
	 * failed probe as "unverified", never "down", and must not skip or
	 * fail over away from a server because of it.
	 */
	ok: boolean;
	status: number | null;
	latencyMs: number;
}

export interface HealthPayload {
	checkedAt: number;
	/** Effective cache lifetime of this payload: HEALTH_TTL_S when all-ok, NEGATIVE_TTL_S when anything failed. */
	ttl: number;
	providers: ProviderHealth[];
}

/**
 * Probe every provider host once, from the edge. A failure is data, not
 * an exception — the caller negative-caches it briefly so a host that
 * refuses edge probes is not hammered. The result only ever CONFIRMS a
 * host answered; it can never prove a host is down for users (see the
 * `ok` contract on ProviderHealth).
 */
export async function probeProviders(
	fetchFn: typeof fetch,
	now: number,
	timeoutMs = 3500
): Promise<HealthPayload> {
	const providers = await Promise.all(
		SERVER_PROVIDERS.map(async (prov): Promise<ProviderHealth> => {
			if (!prov.host) return { id: prov.id, ok: true, status: 200, latencyMs: 0 };
			const started = Date.now();
			try {
				const ctl = new AbortController();
				const timer = setTimeout(() => ctl.abort(), timeoutMs);
				try {
					const res = await fetchFn(`https://${prov.host}/`, { method: 'GET', signal: ctl.signal });
					return { id: prov.id, ok: res.status < 500, status: res.status, latencyMs: Date.now() - started };
				} finally {
					clearTimeout(timer);
				}
			} catch {
				return { id: prov.id, ok: false, status: null, latencyMs: Date.now() - started };
			}
		})
	);
	const allOk = providers.every((p) => p.ok);
	return { checkedAt: now, ttl: allOk ? HEALTH_TTL_S : NEGATIVE_TTL_S, providers };
}

/** Injectable seams for tests: a mock Cache API and a mock fetch. Production uses the real ones. */
export interface WorkerDeps {
	cache?: EdgeCacheLike | null;
	fetchFn?: typeof fetch;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleRequest(req: Request, env: Env, now = Date.now(), deps: WorkerDeps = {}): Promise<Response> {
	const url = new URL(req.url);
	const path = url.pathname;
	const cache: EdgeCacheLike | null = deps.cache !== undefined ? deps.cache : edgeCache();
	const doFetch: typeof fetch = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

	if (req.method === 'GET' && path === '/health') return json({ ok: true, service: 'openmovies-api' });

	/* Resolver: provider + TMDB id -> embed/download URLs, edge-cached (6h).
	 * The payload is a pure function of anonymous params, so the whole PoP
	 * shares one entry and repeat plays cost zero compute. */
	if (req.method === 'GET' && path === '/resolve') {
		const provider = url.searchParams.get('provider') ?? 'bingeapi';
		const typeRaw = url.searchParams.get('type') ?? 'movie';
		const id = Number(url.searchParams.get('id'));
		const season = Math.max(1, Number(url.searchParams.get('season') ?? 1) || 1);
		const episode = Math.max(1, Number(url.searchParams.get('episode') ?? 1) || 1);
		if (typeRaw !== 'movie' && typeRaw !== 'tv') return json({ error: 'bad type' }, 400);
		if (!Number.isInteger(id) || id <= 0) return json({ error: 'bad id' }, 400);
		const params: ResolveParams = { provider, type: typeRaw, id, season, episode };
		const payload = resolvePayloadFor(params);
		if (!payload) return json({ error: 'unknown provider' }, 400);
		const key = resolveCacheKey(params);
		const hit = await readCachedJson(cache, key);
		if (hit !== undefined) return jsonH(hit, 200, { 'x-om-cache': 'HIT' });
		await writeCachedJson(cache, key, payload, RESOLVE_TTL_S);
		return jsonH(payload, 200, { 'x-om-cache': 'MISS' });
	}

	/* Provider health: one probe round, cached 5 min when all-ok and only
	 * 2 min when anything failed (negative caching — a dead server is not
	 * hammered, and the cached "down" answer makes failover instant). */
	if (req.method === 'GET' && path === '/providers/health') {
		const key = healthCacheKey();
		const hit = await readCachedJson(cache, key);
		if (hit !== undefined) return jsonH(hit, 200, { 'x-om-cache': 'HIT' });
		const health = await probeProviders(doFetch, now);
		await writeCachedJson(cache, key, health, health.ttl);
		return jsonH(health, 200, { 'x-om-cache': 'MISS' });
	}

	/* TMDB metadata proxy (only when a server-side key is configured):
	 * success cached 24h; an upstream failure writes a BRIEF negative
	 * entry and later calls inside that window answer 502 from cache
	 * (x-om-cache: NEG) instead of re-hammering TMDB. The cache key is
	 * built from type/id only — the API key never enters a key. */
	if (req.method === 'GET' && path.startsWith('/tmdb/')) {
		const m = /^\/tmdb\/(movie|tv)\/(\d+)$/.exec(path);
		if (!m) return json({ error: 'bad tmdb path' }, 400);
		const type = m[1] as 'movie' | 'tv';
		const id = Number(m[2]);
		if (!env.TMDB_API_KEY) return json({ error: 'tmdb not configured' }, 501);
		const key = tmdbCacheKey(type, id);
		const hit = (await readCachedJson(cache, key)) as Record<string, unknown> | undefined;
		if (hit !== undefined) {
			if (hit._neg) return jsonH({ error: 'tmdb upstream unavailable' }, 502, { 'x-om-cache': 'NEG' });
			return jsonH(hit, 200, { 'x-om-cache': 'HIT' });
		}
		try {
			const res = await doFetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${env.TMDB_API_KEY}`);
			if (!res.ok) throw new Error(`TMDB ${res.status}`);
			const data = (await res.json()) as Record<string, unknown>;
			await writeCachedJson(cache, key, data, TMDB_TTL_S);
			return jsonH(data, 200, { 'x-om-cache': 'MISS' });
		} catch {
			await writeCachedJson(cache, key, { _neg: true }, NEGATIVE_TTL_S);
			return jsonH({ error: 'tmdb upstream unavailable' }, 502, { 'x-om-cache': 'MISS' });
		}
	}

	if (req.method === 'POST' && path === '/auth/request-code') {
		const { email } = (await req.json().catch(() => ({}))) as { email?: string };
		if (!email || !EMAIL_RE.test(email)) return json({ error: 'invalid email' }, 400);
		const prev = await env.DB.prepare('SELECT sent_at FROM codes WHERE email = ?').bind(email).first<{ sent_at: number }>();
		if (prev && now - prev.sent_at < RESEND_COOLDOWN_MS) return json({ error: 'rate limited' }, 429);
		if (!env.RESEND_API_KEY) return json({ error: 'mail not configured' }, 501);
		const code = String(Math.floor(100000 + Math.random() * 900000));
		await env.DB.prepare(
			'INSERT INTO codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at'
		).bind(email, await sha256(`${email}:${code}`), now + CODE_TTL_MS, now).run();
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				from: env.MAIL_FROM ?? 'OpenMovies <login@dawnstudio.app>',
				to: [email],
				subject: `Your OpenMovies sign-in code: ${code}`,
				text: `Your OpenMovies sign-in code is ${code}. It expires in 10 minutes.\n\nOpenMovies is free, with no ads. Your account exists only to keep your watched list, liked titles, resume points and watchlist in sync — your data is used for product analysis only and is never sold.\n\nIf you did not request this, ignore this email.`
			})
		});
		if (!res.ok) return json({ error: 'mail send failed' }, 502);
		return json({ ok: true });
	}

	if (req.method === 'POST' && path === '/auth/verify') {
		const { email, code } = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
		if (!email || !code) return json({ error: 'email and code required' }, 400);
		const row = await env.DB.prepare('SELECT code_hash, expires_at, attempts FROM codes WHERE email = ?')
			.bind(email).first<{ code_hash: string; expires_at: number; attempts: number }>();
		if (!row || row.expires_at < now) return json({ error: 'code expired' }, 401);
		if (row.attempts >= 5) return json({ error: 'too many attempts' }, 429);
		if (row.code_hash !== (await sha256(`${email}:${code}`))) {
			await env.DB.prepare('UPDATE codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
			return json({ error: 'wrong code' }, 401);
		}
		await env.DB.prepare('DELETE FROM codes WHERE email = ?').bind(email).run();
		await env.DB.prepare('INSERT INTO users (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING').bind(email, now).run();
		return json({ token: await makeToken(env.AUTH_SECRET, email, now) });
	}

	if (path === '/me/state' && (req.method === 'GET' || req.method === 'PUT')) {
		const auth = req.headers.get('Authorization') ?? '';
		const email = auth.startsWith('Bearer ') ? await readToken(env.AUTH_SECRET, auth.slice(7), now) : null;
		if (!email) return json({ error: 'unauthorized' }, 401);
		if (req.method === 'GET') {
			const row = await env.DB.prepare('SELECT state FROM states WHERE email = ?').bind(email).first<{ state: string }>();
			return json({ state: row ? JSON.parse(row.state) : null });
		}
		const { state } = (await req.json().catch(() => ({}))) as { state?: unknown };
		if (typeof state !== 'object' || state === null) return json({ error: 'state required' }, 400);
		const body = JSON.stringify(state);
		if (body.length > 200_000) return json({ error: 'state too large' }, 413);
		await env.DB.prepare(
			'INSERT INTO states (email, state, updated_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at'
		).bind(email, body, now).run();
		return json({ ok: true });
	}

	if (req.method === 'POST' && path === '/analytics/event') {
		const { action, titleId } = (await req.json().catch(() => ({}))) as { action?: string; titleId?: number };
		if (!['play', 'detail', 'search', 'download'].includes(action ?? '')) return json({ error: 'bad action' }, 400);
		const day = new Date(now).toISOString().slice(0, 10);
		await env.DB.prepare(
			'INSERT INTO events (day, action, title_id, count) VALUES (?, ?, ?, 1) ON CONFLICT(day, action, title_id) DO UPDATE SET count = count + 1'
		).bind(day, action, typeof titleId === 'number' ? titleId : null).run();
		return json({ ok: true });
	}

	return json({ error: 'not found' }, 404);
}

const CORS = {
	'Access-Control-Allow-Origin': 'https://openmovies.dawnstudio.app',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
};

export default {
	fetch: (req: Request, env: Env) => {
		if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
		return handleRequest(req, env).then((res) => {
			const h = new Headers(res.headers);
			h.set('Access-Control-Allow-Origin', 'https://openmovies.dawnstudio.app');
			h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
			return new Response(res.body, { status: res.status, headers: h });
		});
	}
};
