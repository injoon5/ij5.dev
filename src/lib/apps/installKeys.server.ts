import { eq, randomToken, sha256 } from '$lib/server/crypto';

/**
 * One-time install keys (Shelf plan §9.5).
 *
 * Every prompt Shelf copies carries one, so an agent that can run commands
 * installs the app itself. A prompt pasted into a chat service lives in that
 * service's history, so a key is built to be worth very little once it leaks:
 * one app, one successful write, thirty minutes, five failed tries. The admin
 * token never leaves the phone; only a key is copied.
 *
 * The secret is hashed at rest exactly like `AUTH_HASH`, and the lookup is by
 * the public `id`, so checking a key costs one indexed read and one constant-
 * time compare — never a scan, and never a comparison that leaks timing.
 */

type Env = App.Platform['env'];

export const KEY_PREFIX = 'shelf_ik_';

/** Thirty minutes: long enough to paste a prompt into an agent and let it
 * work, short enough that a key found in a chat log later is dead. */
export const KEY_TTL_MS = 30 * 60 * 1000;

/** Failed writes allowed before the key is burned. A failure leaves the key
 * usable so an agent can fix its code and retry, but not forever. */
export const MAX_KEY_ATTEMPTS = 5;

/** Live keys allowed at once. Shelf mints one per sheet; twenty is far past
 * honest use and stops a stolen admin token from minting without bound. */
export const MAX_LIVE_KEYS = 20;

/** Expired and used keys are kept this long, so Shelf can still read a key's
 * status as "used" or "expired" rather than "unknown", then purged. */
const KEEP_DEAD_MS = 24 * 60 * 60 * 1000;

/** A key that can still be used: bind with `[now, MAX_KEY_ATTEMPTS]`. */
const LIVE = `used_at IS NULL AND expires_at > ? AND attempts < ?`;

/**
 * The one sentence every key failure gets — wrong secret, unknown id, used,
 * expired, burned, wrong slug, wrong route. A caller holding a key learns
 * nothing about which, so a leaked or guessed key cannot be probed.
 */
export const KEY_ERROR = 'This key is used, expired or wrong.';

/** 8 bytes → 11 base64url characters, fixed. The id may itself contain `_`
 * (base64url uses it), so the key is split by length, never by `_`. */
const ID_LENGTH = 11;

export type InstallKeyRow = {
	id: string;
	secret_hash: string;
	slug: string | null;
	created_at: number;
	expires_at: number;
	attempts: number;
	used_at: number | null;
	used_slug: string | null;
};

export type KeyStatus = 'waiting' | 'used' | 'expired';

/** A random value that marks one request's use of a key (see `claimKey`). */
export const newClaim = () => randomToken(16);

/** Splits `shelf_ik_{id}_{secret}`, or null for anything that is not one. */
export function splitKey(token: string): { id: string; secret: string } | null {
	if (!token.startsWith(KEY_PREFIX)) return null;
	const rest = token.slice(KEY_PREFIX.length);
	const id = rest.slice(0, ID_LENGTH);
	const secret = rest.slice(ID_LENGTH + 1);
	if (id.length !== ID_LENGTH || rest[ID_LENGTH] !== '_' || !secret) return null;
	return { id, secret };
}

export function keyStatus(row: InstallKeyRow, now = Date.now()): KeyStatus {
	if (row.used_at !== null) return 'used';
	// A burned key reads as expired: to Shelf both mean "stop waiting".
	if (row.expires_at <= now || row.attempts >= MAX_KEY_ATTEMPTS) return 'expired';
	return 'waiting';
}

export type MintResult =
	| { ok: true; key: string; id: string; expires_at: number }
	| { ok: false; reason: 'too-many' };

export async function mintKey(env: Env, slug: string | null): Promise<MintResult> {
	const now = Date.now();

	// Purging here rather than on a schedule keeps the table small with no
	// cron: keys are only ever minted a few at a time, by one person.
	await env.DB.prepare(`DELETE FROM install_keys WHERE expires_at < ? OR used_at < ?`)
		.bind(now - KEEP_DEAD_MS, now - KEEP_DEAD_MS)
		.run();

	const live = await env.DB.prepare(
		`SELECT COUNT(*) AS n FROM install_keys WHERE ${LIVE}`
	)
		.bind(now, MAX_KEY_ATTEMPTS)
		.first<{ n: number }>();
	if ((live?.n ?? 0) >= MAX_LIVE_KEYS) return { ok: false, reason: 'too-many' };

	const id = randomToken(8);
	const secret = randomToken(32);
	const expires_at = now + KEY_TTL_MS;

	await env.DB.prepare(
		`INSERT INTO install_keys (id, secret_hash, slug, created_at, expires_at)
		 VALUES (?, ?, ?, ?, ?)`
	)
		.bind(id, await sha256(secret), slug, now, expires_at)
		.run();

	return { ok: true, key: `${KEY_PREFIX}${id}_${secret}`, id, expires_at };
}

export async function getKey(env: Env, id: string): Promise<InstallKeyRow | null> {
	return await env.DB.prepare(
		`SELECT id, secret_hash, slug, created_at, expires_at, attempts, used_at, used_slug
		 FROM install_keys WHERE id = ?`
	)
		.bind(id)
		.first<InstallKeyRow>();
}

/** Revoking deletes the row: a revoked key then reads as unknown (404),
 * which is all it is any more. */
export async function revokeKey(env: Env, id: string): Promise<boolean> {
	const res = await env.DB.prepare(`DELETE FROM install_keys WHERE id = ?`).bind(id).run();
	return (res.meta?.changes ?? 0) > 0;
}

/** Live keys for the Security page — never the hash. */
export async function listLiveKeys(
	env: Env
): Promise<Array<Pick<InstallKeyRow, 'id' | 'slug' | 'created_at' | 'expires_at' | 'attempts'>>> {
	const { results } = await env.DB.prepare(
		`SELECT id, slug, created_at, expires_at, attempts FROM install_keys WHERE ${LIVE} ORDER BY created_at DESC`
	)
		.bind(Date.now(), MAX_KEY_ATTEMPTS)
		.all<Pick<InstallKeyRow, 'id' | 'slug' | 'created_at' | 'expires_at' | 'attempts'>>();
	return results;
}

/**
 * Checks a presented key and returns its row if it is live and the secret is
 * right. Every way of failing returns null, so the caller can only ever say
 * `KEY_ERROR`.
 */
export async function checkKey(env: Env, token: string): Promise<InstallKeyRow | null> {
	const parts = splitKey(token);
	if (!parts) return null;

	const row = await getKey(env, parts.id);
	// Hash even when the id is unknown, so a miss costs the same as a hit.
	const presented = await sha256(parts.secret);
	if (!row) return null;
	if (!eq(presented, row.secret_hash)) return null;
	if (keyStatus(row) !== 'waiting') return null;
	return row;
}

/** A failed write (400, 409, 413, 422) costs the key one of its attempts. */
export async function spendAttempt(env: Env, id: string): Promise<void> {
	await env.DB.prepare(`UPDATE install_keys SET attempts = attempts + 1 WHERE id = ?`)
		.bind(id)
		.run();
}

/**
 * Marks a live key as used by the request holding `claim`, as one statement of
 * that request's write batch. Of two requests racing with one key only one
 * matches; `claimed(claim)` is the condition every other statement in the
 * batch adds, so the loser's writes match nothing.
 */
export const claimKey = (env: Env, keyId: string, claim: string, slug: string, now: number) =>
	env.DB.prepare(`UPDATE install_keys SET used_at = ?, used_slug = ?, claim = ? WHERE id = ? AND ${LIVE}`).bind(
		now,
		slug,
		claim,
		keyId,
		now,
		MAX_KEY_ATTEMPTS
	);

export const claimed = (keyId: string, claim: string) => ({
	sql: `EXISTS (SELECT 1 FROM install_keys WHERE id = ? AND claim = ?)`,
	args: [keyId, claim]
});
