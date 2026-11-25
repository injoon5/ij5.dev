import { describe, expect, it } from 'vitest';
import { b64url, clientIp, eq, fromB64, sha256 } from './auth';

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

describe('clientIp', () => {
	const req = (ip?: string) => new Request('https://ij5.dev/', { headers: ip ? { 'cf-connecting-ip': ip } : {} });

	it('keeps an IPv4 address whole', () => {
		expect(clientIp(req('203.0.113.7'))).toBe('203.0.113.7');
	});

	it('folds an IPv6 address to its /64, however it is written', () => {
		const a = clientIp(req('2001:db8:0:1::5'));
		const b = clientIp(req('2001:0db8:0000:0001:ffff:ffff:ffff:ffff'));
		expect(a).toBe('2001:db8:0:1::/64');
		expect(b).toBe(a);
	});

	it('has a stable bucket when the header is missing', () => {
		expect(clientIp(req())).toBe('unknown');
	});
});
