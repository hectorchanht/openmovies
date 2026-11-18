import { describe, expect, it } from 'vitest';
import { handleRequest, makeToken, readToken, type D1Like, type Env } from './index';

/** In-memory D1 stub implementing just the statements the worker issues. */
class MockD1 implements D1Like {
	codes = new Map<string, { code_hash: string; expires_at: number; attempts: number; sent_at: number }>();
	states = new Map<string, string>();
	users = new Set<string>();
	events: { day: string; action: string; title_id: number | null; count: number }[] = [];

	prepare(sql: string) {
		const db = this;
		return {
			bind(...v: unknown[]) {
				return {
					async run() {
						if (sql.startsWith('INSERT INTO codes')) {
							db.codes.set(v[0] as string, { code_hash: v[1] as string, expires_at: v[2] as number, attempts: 0, sent_at: v[3] as number });
						} else if (sql.startsWith('UPDATE codes')) {
							const r = db.codes.get(v[0] as string); if (r) r.attempts++;
						} else if (sql.startsWith('DELETE FROM codes')) db.codes.delete(v[0] as string);
						else if (sql.startsWith('INSERT INTO users')) db.users.add(v[0] as string);
						else if (sql.startsWith('INSERT INTO states')) db.states.set(v[0] as string, v[1] as string);
						else if (sql.startsWith('INSERT INTO events')) {
							const key = db.events.find((e) => e.day === v[0] && e.action === v[1] && e.title_id === (v[2] as number | null));
							if (key) key.count++; else db.events.push({ day: v[0] as string, action: v[1] as string, title_id: v[2] as number | null, count: 1 });
						}
						return {};
					},
					async first<T>() {
						if (sql.startsWith('SELECT sent_at FROM codes')) {
							const r = db.codes.get(v[0] as string);
							return (r ? { sent_at: r.sent_at } : null) as T | null;
						}
						if (sql.startsWith('SELECT code_hash')) {
							const r = db.codes.get(v[0] as string);
							return (r ? { code_hash: r.code_hash, expires_at: r.expires_at, attempts: r.attempts } : null) as T | null;
						}
						if (sql.startsWith('SELECT state FROM states')) {
							const s = db.states.get(v[0] as string);
							return (s ? { state: s } : null) as T | null;
						}
						return null;
					}
				};
			}
		};
	}
}

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
