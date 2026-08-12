import { describe, expect, it } from 'vitest';
import { eq, issue, sha256, valid } from './auth';

/**
 * §13, test 2 — a session cookie verifies, and a tampered signature fails.
 *
 * There is no session table to fall back on: the signature *is* the session,
 * so every one of these is the whole of the auth story for one case.
 */

const SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('session tokens', () => {
	it('issues a token that verifies against the same secret', async () => {
		expect(await valid(await issue(SECRET), SECRET)).toBe(true);
	});

	it('rejects a tampered signature', async () => {
		const [exp, sig] = (await issue(SECRET)).split('.');
		const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
		expect(await valid(`${exp}.${flipped}`, SECRET)).toBe(false);
	});

	it('rejects a tampered expiry — the signature covers it', async () => {
		const [exp, sig] = (await issue(SECRET)).split('.');
		expect(await valid(`${Number(exp) + 864e5}.${sig}`, SECRET)).toBe(false);
	});

	it('rejects a token signed with a different secret, which is how rotation revokes', async () => {
		expect(await valid(await issue(SECRET), 'c29tZS1vdGhlci1zZWNyZXQ=')).toBe(false);
	});

	it('rejects an expired token whose signature is genuine', async () => {
		// Signed the same way `issue` signs, but dated to last week.
		const past = Date.now() - 7 * 864e5;
		const [, sig] = (await issue(SECRET)).split('.');
		expect(sig).toBeTruthy();
		expect(await valid(`${past}.${await signLike(String(past))}`, SECRET)).toBe(false);
	});

	it('rejects malformed and missing tokens without throwing', async () => {
		for (const token of [undefined, '', '.', 'nodot', '123.', '.sig']) {
			expect(await valid(token, SECRET)).toBe(false);
		}
	});

	it('rejects any token when the deployment has no secret configured', async () => {
		expect(await valid(await issue(SECRET), undefined)).toBe(false);
	});
});

describe('eq', () => {
	it('compares equal strings as equal', () => {
		expect(eq('abc', 'abc')).toBe(true);
	});

	it('rejects a difference at any position, and any length mismatch', () => {
		expect(eq('abc', 'abd')).toBe(false);
		expect(eq('abc', 'zbc')).toBe(false);
		expect(eq('abc', 'abcd')).toBe(false);
		expect(eq('', 'a')).toBe(false);
	});
});

describe('sha256', () => {
	it('matches the value `wrangler secret put AUTH_HASH` is given', async () => {
		// base64(SHA-256('')) — a fixed vector, so a change to the encoding
		// helpers cannot silently invalidate a stored AUTH_HASH.
		expect(await sha256('')).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
	});
});

/** Mirrors `issue`'s signing so an expiry can be backdated in the test. */
async function signLike(msg: string) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
	return btoa(String.fromCharCode(...sig));
}
