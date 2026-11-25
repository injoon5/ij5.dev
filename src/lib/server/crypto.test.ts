import { describe, expect, it } from 'vitest';
import { b64url, eq, fromB64, sha256 } from '$lib/server/crypto';
import { clientIp } from '$lib/server/request';

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

describe('base64', () => {
	it('round-trips base64url and standard base64 alike', () => {
		const bytes = new Uint8Array([251, 255, 191, 0, 1, 2, 3]);
		expect([...fromB64(b64url(bytes))]).toEqual([...bytes]);
		expect([...fromB64(btoa(String.fromCharCode(...bytes)))]).toEqual([...bytes]);
	});
});
