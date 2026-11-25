/**
 * Small crypto primitives shared by every sign-in door (§4). The doors
 * themselves live in `sessions.ts`, `password.ts`, `puzzle.ts`,
 * `recovery.ts` and `webauthn.ts`.
 *
 * The admin token is a random 256-bit value rather than a memorable password.
 * Expensive KDFs exist to slow brute-force against low-entropy secrets; 256
 * bits is not brute-forceable at any KDF cost, so one SHA-256 is enough for it
 * (and for session tokens, recovery codes and OIDC codes, which are random
 * too). The one human-chosen secret, the password, goes through Argon2id in
 * `password.ts`.
 */

export const enc = (s: string) => new TextEncoder().encode(s);

export const b64 = (b: ArrayBuffer | Uint8Array) => {
	const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
	let out = '';
	for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
	return btoa(out);
};

export const b64url = (b: ArrayBuffer | Uint8Array) =>
	b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function fromB64(s: string): Uint8Array {
	const std = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** base64 — the encoding `AUTH_HASH` is stored in. */
export const sha256 = async (s: string) => b64(await crypto.subtle.digest('SHA-256', enc(s)));

/** base64url — for values that end up in URLs or as table keys. */
export const sha256url = async (s: string) =>
	b64url(await crypto.subtle.digest('SHA-256', enc(s)));

/** Constant-time compare. Never use `===` on a secret. */
export function eq(a: string, b: string) {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return d === 0;
}

export async function hmac(msg: string, secret: string) {
	const k = await crypto.subtle.importKey(
		'raw',
		enc(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return b64url(await crypto.subtle.sign('HMAC', k, enc(msg)));
}

/** `bytes` of CSPRNG output, base64url. 32 bytes is a 256-bit token. */
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
