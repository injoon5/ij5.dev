import { describe, expect, it } from 'vitest';
import { isTargetUrl } from './slugs';

/**
 * The shortener's destination is a `Location:` header, not a page — so
 * `mailto:` is as valid as `https:`. The scheme allow-list is what keeps a
 * paste from smuggling in `javascript:` or `data:` as a redirect payload.
 */

describe('isTargetUrl', () => {
	it('accepts http and https, with or without a www', () => {
		expect(isTargetUrl('https://ij5.dev')).toBe(true);
		expect(isTargetUrl('https://www.example.com/a/b?c=d')).toBe(true);
		expect(isTargetUrl('http://example.com')).toBe(true);
	});

	it('accepts mailto, tel and sms', () => {
		expect(isTargetUrl('mailto:hi@ij5.dev')).toBe(true);
		expect(isTargetUrl('tel:+15551234567')).toBe(true);
		expect(isTargetUrl('sms:+15551234567')).toBe(true);
	});

	it('rejects schemes that would turn a redirect into a payload', () => {
		for (const bad of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd']) {
			expect(isTargetUrl(bad)).toBe(false);
		}
	});

	it('rejects strings that are not a URL at all', () => {
		for (const bad of ['', 'example.com', 'not a url', 'https://']) {
			expect(isTargetUrl(bad)).toBe(false);
		}
	});
});
