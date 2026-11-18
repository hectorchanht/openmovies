/**
 * openmovies-api — the only server OpenMovies has.
 * Routes:
 *   POST /auth/request-code  {email}        -> emails a 6-digit code (Resend)
 *   POST /auth/verify        {email, code}  -> {token} (HMAC session, 30d)
 *   GET  /me/state           Bearer token   -> {state}  (watched/liked/resume/watchlist)
 *   PUT  /me/state           Bearer token   -> stores the personal state JSON
 *   POST /analytics/event    {action, titleId?} -> anonymous aggregate counter
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleRequest(req: Request, env: Env, now = Date.now()): Promise<Response> {
	const url = new URL(req.url);
	const path = url.pathname;

	if (req.method === 'GET' && path === '/health') return json({ ok: true, service: 'openmovies-api' });

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
		if (!['play', 'detail', 'search'].includes(action ?? '')) return json({ error: 'bad action' }, 400);
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
