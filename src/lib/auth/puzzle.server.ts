import { b64url, enc, eq, fromB64, hmac } from '$lib/server/crypto';

/**
 * The puzzle: the second half of signing in from a borrowed computer.
 *
 * The page shows a 4×4 grid of random digits. The secret, `PUZZLE_PATH`, is a
 * route through the grid — say `A1 B2 C3 C4` (column letter, row number) —
 * and the answer is the digits along it, in order. The grid is new on every
 * load, so the answer is too: a keylogger on the borrowed machine records an
 * answer that will never be asked for again.
 *
 * What it does not stop: someone who sees two or three of your grids *and*
 * answers can work the route out. That is why a password + puzzle sign-in is a
 * `limited` session, and why every one sends an alert.
 *
 * The grid is signed rather than stored, so loading the login page writes
 * nothing. A row is written when a grid is answered, and a grid answered once
 * is refused after that — right or wrong — so each grid gets one guess.
 */

type Env = App.Platform['env'];

export const SIZE = 4;
const TTL_MS = 5 * 60e3;
const MIN_LEN = 4;
const MAX_LEN = 8;

export type Challenge = { grid: number[]; nonce: string; exp: number };

/** `A1 B2 C3 C4` → cell indices, or null when the secret is malformed. */
export function parsePath(raw: string | undefined): number[] | null {
	const cells = (raw ?? '')
		.toUpperCase()
		.split(/[\s,;>-]+/)
		.filter(Boolean);
	if (cells.length < MIN_LEN || cells.length > MAX_LEN) return null;
	const out: number[] = [];
	for (const c of cells) {
		const m = /^([A-D])([1-4])$/.exec(c);
		if (!m) return null;
		out.push((Number(m[2]) - 1) * SIZE + (m[1].charCodeAt(0) - 65));
	}
	return out;
}

function randomDigits(n: number): number[] {
	const out: number[] = [];
	while (out.length < n) {
		// Rejection sampling: 250 is the largest multiple of 10 under 256, so
		// every digit is exactly equally likely.
		for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) {
			if (b < 250 && out.length < n) out.push(b % 10);
		}
	}
	return out;
}

const sign = (payload: string, secret: string) => hmac(`puzzle:${payload}`, secret);

export async function newChallenge(secret: string, now = Date.now()): Promise<{ token: string; grid: number[] }> {
	const challenge: Challenge = {
		grid: randomDigits(SIZE * SIZE),
		nonce: b64url(crypto.getRandomValues(new Uint8Array(16))),
		exp: now + TTL_MS
	};
	const payload = b64url(enc(JSON.stringify(challenge)));
	return { token: `${payload}.${await sign(payload, secret)}`, grid: challenge.grid };
}

/** The challenge a token carries, if it is ours and still live. */
export async function readChallenge(
	token: string,
	secret: string,
	now = Date.now()
): Promise<Challenge | null> {
	const [payload, sig] = token.split('.');
	if (!payload || !sig || !eq(sig, await sign(payload, secret))) return null;
	try {
		const c = JSON.parse(new TextDecoder().decode(fromB64(payload))) as Challenge;
		if (!Array.isArray(c.grid) || c.grid.length !== SIZE * SIZE || typeof c.nonce !== 'string') return null;
		return c.exp > now ? c : null;
	} catch {
		return null;
	}
}

export const expectedAnswer = (grid: number[], path: number[]) => path.map((i) => grid[i]).join('');

/** Digits only, so "4 7 1 9" and "4719" are the same answer. */
export function answerMatches(answer: string, grid: number[], path: number[]): boolean {
	return eq(answer.replace(/\D/g, ''), expectedAnswer(grid, path));
}

/** True the first time a grid is answered, false every time after. */
export async function spendChallenge(env: Env, c: Challenge, now = Date.now()): Promise<boolean> {
	const [, inserted] = await env.DB.batch([
		env.DB.prepare(`DELETE FROM puzzle_used WHERE expires_at <= ?`).bind(now),
		env.DB.prepare(`INSERT OR IGNORE INTO puzzle_used (nonce, expires_at) VALUES (?, ?)`).bind(
			c.nonce,
			c.exp
		)
	]);
	return (inserted.meta.changes ?? 0) === 1;
}
