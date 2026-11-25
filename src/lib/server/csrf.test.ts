import { describe, expect, it } from 'vitest';
import { crossSiteForm } from './csrf';

const url = new URL('https://ij5.dev/login?/password');
const post = (headers: Record<string, string>, path = url.toString()) =>
	new Request(path, { method: 'POST', headers });

describe('crossSiteForm', () => {
	it('allows a same-origin form post', () => {
		expect(crossSiteForm(post({ 'content-type': 'application/x-www-form-urlencoded', origin: 'https://ij5.dev' }), url)).toBe(false);
	});

	it('refuses a form post from another origin, or with no origin at all', () => {
		for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain']) {
			expect(crossSiteForm(post({ 'content-type': type, origin: 'https://evil.example' }), url)).toBe(true);
			expect(crossSiteForm(post({ 'content-type': type }), url)).toBe(true);
		}
	});

	it('leaves non-form bodies to the routes (JSON needs a CORS preflight anyway)', () => {
		expect(crossSiteForm(post({ 'content-type': 'application/json', origin: 'https://evil.example' }), url)).toBe(false);
	});

	it('exempts only the two OIDC endpoints Access calls server to server', () => {
		const token = new URL('https://ij5.dev/oauth/token');
		expect(crossSiteForm(post({ 'content-type': 'application/x-www-form-urlencoded' }, token.toString()), token)).toBe(false);
		const authorize = new URL('https://ij5.dev/oauth/authorize');
		expect(crossSiteForm(post({ 'content-type': 'application/x-www-form-urlencoded' }, authorize.toString()), authorize)).toBe(true);
	});

	it('never blocks a read', () => {
		expect(crossSiteForm(new Request(url, { headers: { 'content-type': 'text/plain' } }), url)).toBe(false);
	});
});
