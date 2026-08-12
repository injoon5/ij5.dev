/**
 * Single-user auth (§4). Stateless: verify a 256-bit token once, hand back a
 * signed cookie, verify an HMAC thereafter.
 *
 * The credential is a random 256-bit token rather than a memorable password.
 * Expensive KDFs exist to slow brute-force against low-entropy secrets; 256
 * bits is not brute-forceable at any KDF cost, so one SHA-256 replaces 210k
 * PBKDF2 rounds and fits the 10ms CPU budget.
 *
 * This is safe *because* it is single-user — no registration, enumeration,
 * reset, or account linking. Do not reuse it anywhere multi-tenant.
 */

const enc = (s: string) => new TextEncoder().encode(s);

const b64 = (b: ArrayBuffer) => {
	const bytes = new Uint8Array(b);
	let out = '';
	for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
	return btoa(out);
};

export const sha256 = async (s: string) => b64(await crypto.subtle.digest('SHA-256', enc(s)));

/** Constant-time compare. Never use `===` on a secret. */
export function eq(a: string, b: string) {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return d === 0;
}

async function hmac(msg: string, secret: string) {
	const k = await crypto.subtle.importKey(
		'raw',
		enc(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return b64(await crypto.subtle.sign('HMAC', k, enc(msg)));
}

const THIRTY_DAYS_MS = 30 * 864e5;

export async function issue(secret: string) {
	const exp = Date.now() + THIRTY_DAYS_MS;
	return `${exp}.${await hmac(String(exp), secret)}`;
}

export async function valid(token: string | undefined, secret: string | undefined) {
	if (!token || !secret) return false;
	const [exp, sig] = token.split('.');
	if (!exp || !sig) return false;
	if (!eq(sig, await hmac(exp, secret))) return false;
	return Number(exp) > Date.now();
}

export const SESSION_COOKIE = 'sid';

export const cookieOptions = {
	path: '/',
	httpOnly: true,
	secure: true,
	sameSite: 'lax',
	maxAge: 30 * 86400
} as const;
