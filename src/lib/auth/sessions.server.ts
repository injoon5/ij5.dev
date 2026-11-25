import { randomToken, sha256url } from '$lib/server/crypto';

/**
 * Server-side sessions (§4). The cookie carries a random 256-bit token; D1
 * keeps only its SHA-256, so every session can be listed and revoked one at a
 * time, and a copy of the table is not a pile of cookies.
 *
 * Two strengths:
 *
 * - `full` — passkey, admin token or password + recovery code. Lasts 30 days.
 * - `limited` — password + puzzle, the way in from a borrowed computer. Lasts
 *   an hour at most and only as long as the browser stays open; it cannot
 *   change security settings or delete anything (`requireFull`), and the OIDC
 *   `strength` claim tells Cloudflare Access which kind it was.
 */

type Env = App.Platform['env'];

export type Strength = 'full' | 'limited';
export type Method = 'passkey' | 'token' | 'password' | 'recovery';

export type SessionRow = {
	id: string;
	strength: Strength;
	method: Method;
	created_at: number;
	last_seen_at: number;
	expires_at: number;
	ip: string | null;
	country: string | null;
	user_agent: string | null;
};

/** `__Host-`: Secure, Path=/, and no Domain — no subdomain can set or shadow it. */
export const SESSION_COOKIE = '__Host-sid';

const FULL_MS = 30 * 864e5;
const LIMITED_MS = 60 * 60e3;
/** `last_seen_at` is a hint for the session list, not worth a write per request. */
const TOUCH_EVERY_MS = 5 * 60e3;

export const lifetime = (strength: Strength) => (strength === 'full' ? FULL_MS : LIMITED_MS);

const COLUMNS = `id, strength, method, created_at, last_seen_at, expires_at, ip, country, user_agent`;

export function cookieOptions(strength: Strength) {
	return {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		// A limited session gets a browser-session cookie: closing the borrowed
		// browser forgets it even before the hour is up.
		...(strength === 'full' ? { maxAge: FULL_MS / 1000 } : {})
	} as const;
}

export async function createSession(
	env: Env,
	strength: Strength,
	method: Method,
	meta: { ip: string | null; country: string | null; userAgent: string | null },
	now = Date.now()
): Promise<{ token: string; row: SessionRow }> {
	const token = randomToken();
	const row: SessionRow = {
		id: await sha256url(token),
		strength,
		method,
		created_at: now,
		last_seen_at: now,
		expires_at: now + lifetime(strength),
		ip: meta.ip,
		country: meta.country,
		user_agent: meta.userAgent
	};
	await env.DB.batch([
		env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(now),
		env.DB.prepare(`INSERT INTO sessions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
			row.id,
			row.strength,
			row.method,
			row.created_at,
			row.last_seen_at,
			row.expires_at,
			row.ip,
			row.country,
			row.user_agent
		)
	]);
	return { token, row };
}

/**
 * The live session for a cookie token, or null. `touch` receives the write
 * that refreshes `last_seen_at` when one is due, so the caller can hand it to
 * `waitUntil` instead of making the request wait on it.
 */
export async function readSession(
	env: Env,
	token: string | undefined,
	touch?: (p: Promise<unknown>) => void,
	now = Date.now()
): Promise<SessionRow | null> {
	if (!token || token.length > 100) return null;
	const id = await sha256url(token);
	const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM sessions WHERE id = ? AND expires_at > ?`)
		.bind(id, now)
		.first<SessionRow>();
	if (!row) return null;
	if (touch && now - row.last_seen_at > TOUCH_EVERY_MS) {
		touch(env.DB.prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`).bind(now, id).run());
	}
	return row;
}

export async function listSessions(env: Env, now = Date.now()): Promise<SessionRow[]> {
	const { results } = await env.DB.prepare(
		`SELECT ${COLUMNS} FROM sessions WHERE expires_at > ? ORDER BY last_seen_at DESC`
	)
		.bind(now)
		.all<SessionRow>();
	return results;
}

export async function deleteSession(env: Env, id: string) {
	await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(id).run();
}

export async function deleteOtherSessions(env: Env, keepId: string) {
	const r = await env.DB.prepare(`DELETE FROM sessions WHERE id != ?`).bind(keepId).run();
	return r.meta.changes ?? 0;
}
