import { describe, expect, it } from 'vitest';
import { clientIp } from './request';

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
