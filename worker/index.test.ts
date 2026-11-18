import { describe, expect, it } from 'vitest';
import { handleRequest, makeToken, readToken, type Env } from './index';
import { MockD1 } from './test-mock-d1';

const NOW = 1_800_000_000_000;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
	new Request(`https://api.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('openmovies-api', () => {
	it('health + 404', async () => {
		const env: Env = { DB: new MockD1(), AUTH_SECRET: 's' };
		expect((await handleRequest(new Request('https://api.test/health'), env, NOW)).status).toBe(200);
		expect((await handleRequest(new Request('https://api.test/nope'), env, NOW)).status).toBe(404);
	});

	it('request-code without a mail key is an honest 501, and bad emails 400', async () => {
		const env: Env = { DB: new MockD1(), AUTH_SECRET: 's' };
		expect((await handleRequest(post('/auth/request-code', { email: 'a@b.co' }), env, NOW)).status).toBe(501);
		expect((await handleRequest(post('/auth/request-code', { email: 'nope' }), env, NOW)).status).toBe(400);
	});

	it('full code flow with a mock mailer: request -> verify -> state sync round-trip', async () => {
		const db = new MockD1();
		const env: Env = { DB: db, AUTH_SECRET: 'test-secret', RESEND_API_KEY: 'rk_test' };
		const realFetch = globalThis.fetch;
		let mailedCode = '';
		globalThis.fetch = (async (_url: string, init: { body: string }) => {
			mailedCode = /code is (\d{6})/.exec(init.body)?.[1] ?? '';
			return new Response('{}', { status: 200 });
		}) as typeof fetch;
		try {
			expect((await handleRequest(post('/auth/request-code', { email: 'a@b.co' }), env, NOW)).status).toBe(200);
			expect(mailedCode).toMatch(/^\d{6}$/);
			// wrong code -> 401 and burns an attempt
			expect((await handleRequest(post('/auth/verify', { email: 'a@b.co', code: '000000' === mailedCode ? '111111' : '000000' }), env, NOW)).status).toBe(401);
			const ok = await handleRequest(post('/auth/verify', { email: 'a@b.co', code: mailedCode }), env, NOW);
			expect(ok.status).toBe(200);
			const { token } = (await ok.json()) as { token: string };
			expect(token).toBeTruthy();
			// sync: PUT then GET with the token (mock auth e2e)
			const state = { liked: [27205], watchlist: [], watched: [], resume: {}, flags: { serverSwitched: false } };
			const put = new Request('https://api.test/me/state', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) });
			expect((await handleRequest(put, env, NOW)).status).toBe(200);
			const got = await handleRequest(new Request('https://api.test/me/state', { headers: { Authorization: `Bearer ${token}` } }), env, NOW);
			expect(((await got.json()) as { state: { liked: number[] } }).state.liked).toEqual([27205]);
			// no token -> 401; tampered token -> 401
			expect((await handleRequest(new Request('https://api.test/me/state'), env, NOW)).status).toBe(401);
			const bad = new Request('https://api.test/me/state', { headers: { Authorization: `Bearer ${token}x` } });
			expect((await handleRequest(bad, env, NOW)).status).toBe(401);
		} finally {
			globalThis.fetch = realFetch;
		}
	});

	it('tokens expire and analytics validate actions', async () => {
		const env: Env = { DB: new MockD1(), AUTH_SECRET: 's' };
		const t = await makeToken('s', 'a@b.co', NOW);
		expect(await readToken('s', t, NOW + 1000)).toBe('a@b.co');
		expect(await readToken('s', t, NOW + 31 * 24 * 3600 * 1000)).toBeNull();
		expect((await handleRequest(post('/analytics/event', { action: 'play', titleId: 1 }), env, NOW)).status).toBe(200);
		expect((await handleRequest(post('/analytics/event', { action: 'hack' }), env, NOW)).status).toBe(400);
	});
});
