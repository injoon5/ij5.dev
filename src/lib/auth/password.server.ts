import { argon2id } from '@noble/hashes/argon2.js';
import { b64, enc, eq, fromB64 } from '$lib/server/crypto';

/**
 * The password — the one human-chosen secret, so the one that gets a slow
 * hash. Argon2id at OWASP's first recommended setting (19 MiB, 2 passes, 1
 * lane) costs about 120 ms of CPU, which the paid Workers plan allows.
 *
 * `@noble/hashes` and not a WASM build: Workers refuse to compile WebAssembly
 * from bytes at runtime, which is how most WASM hashing packages load.
 *
 * The hash lives in the `PASSWORD_HASH` secret, never in D1, and is keyed with
 * `PASSWORD_PEPPER` through Argon2's own secret input. Without both, the hash
 * is not even crackable offline; with neither, the only attack left is
 * guessing online, which `throttle.ts` limits.
 *
 * Format is the standard PHC string, so the cost can be raised later by
 * re-hashing with `scripts/auth.mjs password` — old parameters keep verifying
 * until then.
 */

export type ParsedHash = { m: number; t: number; p: number; salt: Uint8Array; hash: Uint8Array };

export function parseHash(phc: string | undefined): ParsedHash | null {
	const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/_-]+)\$([A-Za-z0-9+/_-]+)$/.exec(
		(phc ?? '').trim()
	);
	if (!m) return null;
	const [mem, t, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
	// Guard the Worker's memory and CPU against a mistyped secret.
	if (mem < 8 * 1024 || mem > 64 * 1024 || t < 1 || t > 10 || p !== 1) return null;
	return { m: mem, t, p, salt: fromB64(m[4]), hash: fromB64(m[5]) };
}

export function hashWith(password: string, pepper: string, params: Omit<ParsedHash, 'hash'>, dkLen = 32) {
	return argon2id(enc(password.normalize('NFKC')), params.salt, {
		m: params.m,
		t: params.t,
		p: params.p,
		key: enc(pepper),
		dkLen
	});
}

/** For `scripts/auth.mjs` and tests: a fresh PHC string. */
export function hashPassword(password: string, pepper: string, m = 19456, t = 2): string {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = hashWith(password, pepper, { m, t, p: 1, salt });
	const nopad = (b: Uint8Array) => b64(b).replace(/=+$/, '');
	return `$argon2id$v=19$m=${m},t=${t},p=1$${nopad(salt)}$${nopad(hash)}`;
}

/** A dummy hash to spend the same time on when the configuration is broken. */
const DUMMY = { m: 19456, t: 2, p: 1, salt: new Uint8Array(16) };

/**
 * Always pays the full hash, whether or not the stored one parses, so the
 * time a request takes says nothing about why it failed.
 */
export function verifyPassword(password: string, phc: string | undefined, pepper: string | undefined): boolean {
	const parsed = parseHash(phc);
	if (!parsed || !pepper) {
		hashWith(password, pepper ?? '', DUMMY);
		return false;
	}
	const got = hashWith(password, pepper, parsed, parsed.hash.length);
	return eq(b64(got), b64(parsed.hash));
}
