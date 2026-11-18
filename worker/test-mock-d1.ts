import type { D1Like } from './index';

/** In-memory D1 stub implementing just the statements the worker issues. Shared by the worker test suites. */
export class MockD1 implements D1Like {
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
