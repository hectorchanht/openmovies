import { describe, expect, it, vi } from 'vitest';
import {
	handleRequest,
	healthCacheKey,
	resolveCacheKey,
	resolvePayloadFor,
	tmdbCacheKey,
	NEGATIVE_TTL_S,
	RESOLVE_TTL_S,
	TMDB_TTL_S,
	type EdgeCacheLike,
	type Env
} from './index';
import { MockD1 } from './test-mock-d1';

/** In-memory Cache API stub: stores body + Cache-Control per key URL. */
class MockCache implements EdgeCacheLike {
	store = new Map<string, { body: string; cacheControl: string }>();
	async match(request: Request): Promise<Response | undefined> {
		const e = this.store.get(request.url);
		if (!e) return undefined;
		return new Response(e.body, { status: 200, headers: { 'content-type': 'application/json', 'Cache-Control': e.cacheControl } });
	}
	async put(request: Request, response: Response): Promise<void> {
		this.store.set(request.url, {
			body: await response.clone().text(),
			cacheControl: response.headers.get('Cache-Control') ?? ''
		});
	}
	async delete(request: Request): Promise<boolean> {
		return this.store.delete(request.url);
	}
}

const NOW = 1_800_000_000_000;
const env = (cache?: MockCache, extra: Partial<Env> = {}): { env: Env; deps: { cache: EdgeCacheLike | null; fetchFn?: typeof fetch } } => ({
	env: { DB: new MockD1(), AUTH_SECRET: 's', ...extra },
	deps: { cache: cache ?? null }
});
const get = (path: string) => new Request(`https://api.test${path}`);

describe('cache keys', () => {
	it('are versioned, anonymous and deterministic — no secrets, no per-user data', () => {
		const a = resolveCacheKey({ provider: 'vidlink', type: 'movie', id: 27205, season: 1, episode: 1 });
		const b = resolveCacheKey({ provider: 'vidlink', type: 'movie', id: 27205, season: 1, episode: 1 });
		expect(a.url).toBe(b.url);
		expect(a.url).toContain('/_cache/v1/resolve');
		expect(a.url).not.toMatch(/key|token|email|user/i);
		expect(tmdbCacheKey('movie', 27205).url).toContain('/_cache/v1/tmdb/movie/27205');
		expect(healthCacheKey().url).toContain('/_cache/v1/providers-health');
	});

	it('resolvePayloadFor mirrors the client registry URLs', () => {
		expect(resolvePayloadFor({ provider: 'bingeapi', type: 'movie', id: 27205, season: 1, episode: 1 })?.embedUrl).toBe(
			'https://bingeapi.st/embed/movie/27205?color=e8590c'
		);
		expect(resolvePayloadFor({ provider: 'bingeapi', type: 'tv', id: 1396, season: 2, episode: 3 })?.embedUrl).toBe(
			'https://bingeapi.st/embed/tv/1396/2/3?color=e8590c'
		);
		expect(resolvePayloadFor({ provider: 'embedwave', type: 'movie', id: 577922, season: 1, episode: 1 })?.embedUrl).toBe(
			'https://embedwave.cc/embed/movie/577922'
		);
		expect(resolvePayloadFor({ provider: 'embedwave', type: 'tv', id: 1399, season: 1, episode: 1 })?.embedUrl).toBe(
			'https://embedwave.cc/embed/tv/1399/1/1'
		);
		expect(resolvePayloadFor({ provider: 'vidlink', type: 'movie', id: 27205, season: 1, episode: 1 })?.embedUrl).toBe(
			'https://vidlink.pro/movie/27205?primaryColor=e8590c'
		);
		expect(resolvePayloadFor({ provider: 'vidfast', type: 'tv', id: 1396, season: 2, episode: 3 })?.embedUrl).toBe(
			'https://vidfast.pro/tv/1396/2/3'
		);
		expect(resolvePayloadFor({ provider: 'vidfast', type: 'tv', id: 1396, season: 2, episode: 3 })?.downloadUrl).toBeNull();
		expect(resolvePayloadFor({ provider: 'nope', type: 'movie', id: 1, season: 1, episode: 1 })).toBeNull();
	});
});

describe('GET /resolve — edge cached', () => {
	it('MISS then HIT, stored with the 6h resolver TTL', async () => {
		const cache = new MockCache();
		const { env: e, deps } = env(cache);
		const r1 = await handleRequest(get('/resolve?provider=vidfast&type=movie&id=27205'), e, NOW, deps);
		expect(r1.status).toBe(200);
		expect(r1.headers.get('x-om-cache')).toBe('MISS');
		const body1 = (await r1.json()) as { embedUrl: string; downloadUrl: string | null };
		expect(body1.embedUrl).toBe('https://vidfast.pro/movie/27205');
		expect(body1.downloadUrl).toBeNull();
		const stored = [...cache.store.values()][0];
		expect(stored.cacheControl).toBe(`public, max-age=${RESOLVE_TTL_S}`);

		const r2 = await handleRequest(get('/resolve?provider=vidfast&type=movie&id=27205'), e, NOW, deps);
		expect(r2.headers.get('x-om-cache')).toBe('HIT');
		expect(((await r2.json()) as { embedUrl: string }).embedUrl).toBe(body1.embedUrl);
	});

	it('validates provider, type and id (400s are not cached)', async () => {
		const cache = new MockCache();
		const { env: e, deps } = env(cache);
		expect((await handleRequest(get('/resolve?provider=nope&type=movie&id=1'), e, NOW, deps)).status).toBe(400);
		expect((await handleRequest(get('/resolve?provider=vidlink&type=book&id=1'), e, NOW, deps)).status).toBe(400);
		expect((await handleRequest(get('/resolve?provider=vidlink&type=movie&id=-3'), e, NOW, deps)).status).toBe(400);
		expect(cache.store.size).toBe(0);
	});

	it('defaults to BingeAPI (Server 1) when no provider is given', async () => {
		const { env: e, deps } = env(undefined);
		const r = await handleRequest(get('/resolve?type=movie&id=577922'), e, NOW, deps);
		expect(r.status).toBe(200);
		const body = (await r.json()) as { provider: string; embedUrl: string };
		expect(body.provider).toBe('bingeapi');
		expect(body.embedUrl).toBe('https://bingeapi.st/embed/movie/577922?color=e8590c');
	});

	it('works with no Cache API at all (degrades to compute)', async () => {
		const { env: e, deps } = env(undefined);
		const r = await handleRequest(get('/resolve?provider=demo&type=movie&id=1'), e, NOW, deps);
		expect(r.status).toBe(200);
		expect(((await r.json()) as { embedUrl: string }).embedUrl).toBe('about:blank');
	});
});

describe('GET /providers/health — negative caching', () => {
	it('a failed probe is cached briefly (NEGATIVE_TTL) and not re-probed inside the window', async () => {
		const cache = new MockCache();
		const fetchMock = vi.fn(async (u: string) => {
			if (u.includes('vidfast')) throw new Error('probe blocked');
			return new Response('', { status: 200 });
		});
		const fetchFn = fetchMock as unknown as typeof fetch;
		const { env: e } = env(cache);
		const deps = { cache: cache as EdgeCacheLike, fetchFn };

		const r1 = await handleRequest(get('/providers/health'), e, NOW, deps);
		expect(r1.headers.get('x-om-cache')).toBe('MISS');
		const h1 = (await r1.json()) as { ttl: number; providers: { id: string; ok: boolean }[] };
		expect(h1.ttl).toBe(NEGATIVE_TTL_S);
		// A failed probe means "unconfirmed from the edge", never "down" —
		// the ok:false here is all the client gets, and it renders it as
		// "unverified" only (see providerMarker in src/lib/providers.ts).
		expect(h1.providers.find((p) => p.id === 'vidfast')?.ok).toBe(false);
		expect(h1.providers.find((p) => p.id === 'vidlink')?.ok).toBe(true);
		expect(h1.providers.find((p) => p.id === 'demo')?.ok).toBe(true);
		const probes = fetchMock.mock.calls.length;
		expect(probes).toBe(4); // 4 hosted providers; demo is never probed

		const r2 = await handleRequest(get('/providers/health'), e, NOW, deps);
		expect(r2.headers.get('x-om-cache')).toBe('HIT');
		expect(fetchMock.mock.calls.length).toBe(probes); // dead host NOT hammered
	});

	it('an all-ok round is cached for the full health TTL', async () => {
		const cache = new MockCache();
		const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
		const fetchFn = fetchMock as unknown as typeof fetch;
		const { env: e } = env(cache);
		const r = await handleRequest(get('/providers/health'), e, NOW, { cache: cache as EdgeCacheLike, fetchFn });
		const h = (await r.json()) as { ttl: number };
		expect(h.ttl).toBe(300);
		expect([...cache.store.values()][0].cacheControl).toBe('public, max-age=300');
	});
});

describe('GET /tmdb/:type/:id — long TTL + negative caching', () => {
	it('is an honest 501 without a server key', async () => {
		const { env: e, deps } = env(new MockCache());
		expect((await handleRequest(get('/tmdb/movie/27205'), e, NOW, deps)).status).toBe(501);
	});

	it('caches success for 24h, key never enters a cache key, upstream hit once', async () => {
		const cache = new MockCache();
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 27205, title: 'Inception' }), { status: 200 }));
		const fetchFn = fetchMock as unknown as typeof fetch;
		const { env: e } = env(cache, { TMDB_API_KEY: 'SECRETKEY' });
		const deps = { cache: cache as EdgeCacheLike, fetchFn };

		const r1 = await handleRequest(get('/tmdb/movie/27205'), e, NOW, deps);
		expect(r1.headers.get('x-om-cache')).toBe('MISS');
		expect([...cache.store.keys()].join(' ')).not.toContain('SECRETKEY');
		expect([...cache.store.values()][0].cacheControl).toBe(`public, max-age=${TMDB_TTL_S}`);

		const r2 = await handleRequest(get('/tmdb/movie/27205'), e, NOW, deps);
		expect(r2.headers.get('x-om-cache')).toBe('HIT');
		expect(fetchMock.mock.calls.length).toBe(1);
	});

	it('an upstream failure writes a brief negative entry; the next call answers NEG without re-fetching', async () => {
		const cache = new MockCache();
		const fetchMock = vi.fn(async () => new Response('err', { status: 500 }));
		const fetchFn = fetchMock as unknown as typeof fetch;
		const { env: e } = env(cache, { TMDB_API_KEY: 'k' });
		const deps = { cache: cache as EdgeCacheLike, fetchFn };

		const r1 = await handleRequest(get('/tmdb/movie/999'), e, NOW, deps);
		expect(r1.status).toBe(502);
		expect(r1.headers.get('x-om-cache')).toBe('MISS');
		expect([...cache.store.values()][0].cacheControl).toBe(`public, max-age=${NEGATIVE_TTL_S}`);

		const r2 = await handleRequest(get('/tmdb/movie/999'), e, NOW, deps);
		expect(r2.status).toBe(502);
		expect(r2.headers.get('x-om-cache')).toBe('NEG');
		expect(fetchMock.mock.calls.length).toBe(1);
	});
});
