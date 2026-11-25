import { sha256url } from '$lib/server/crypto';

/**
 * Paper recovery codes: the way back in with nothing on you — no phone,
 * no laptop, no password manager. Ten codes, ten Crockford base32 characters
 * each (50 random bits), printed and kept in a wallet or a drawer.
 *
 * Signing in takes the password *and* a code, so a found sheet of paper is not
 * enough on its own. A code gives a `full` session (it can enrol a new
 * passkey), and it works once.
 */

type Env = App.Platform['env'];

/** Crockford base32: no I, L, O or U, so nothing reads as something else. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 10;
export const COUNT = 10;

export function newCode(): string {
	let raw = '';
	for (const b of crypto.getRandomValues(new Uint8Array(LENGTH))) raw += ALPHABET[b & 31];
	return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** What someone types → the canonical code, or null if it cannot be one. */
export function normalise(input: string): string | null {
	const s = input
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
	if (s.length !== LENGTH) return null;
	for (const ch of s) if (!ALPHABET.includes(ch)) return null;
	return s;
}

const hashOf = (canonical: string) => sha256url(`recovery:${canonical}`);

/** Replaces every code with a fresh set and returns it — shown once, never stored. */
export async function regenerate(env: Env, now = Date.now()): Promise<string[]> {
	const codes = Array.from({ length: COUNT }, newCode);
	const hashes = await Promise.all(codes.map((c) => hashOf(normalise(c)!)));
	await env.DB.batch([
		env.DB.prepare(`DELETE FROM recovery_codes`),
		...hashes.map((h) =>
			env.DB.prepare(`INSERT INTO recovery_codes (hash, created_at) VALUES (?, ?)`).bind(h, now)
		)
	]);
	return codes;
}

export async function remaining(env: Env): Promise<{ left: number; total: number; created_at: number | null }> {
	const row = await env.DB.prepare(
		`SELECT COUNT(*) AS total, SUM(used_at IS NULL) AS left, MIN(created_at) AS created_at FROM recovery_codes`
	).first<{ total: number; left: number | null; created_at: number | null }>();
	return { total: row?.total ?? 0, left: row?.left ?? 0, created_at: row?.created_at ?? null };
}

/**
 * Burns a code if it is live. The UPDATE is the check: of two requests racing
 * with one code, only one changes the row.
 */
export async function spend(env: Env, input: string, now = Date.now()): Promise<boolean> {
	const canonical = normalise(input);
	if (!canonical) return false;
	const r = await env.DB.prepare(`UPDATE recovery_codes SET used_at = ? WHERE hash = ? AND used_at IS NULL`)
		.bind(now, await hashOf(canonical))
		.run();
	return (r.meta.changes ?? 0) === 1;
}
