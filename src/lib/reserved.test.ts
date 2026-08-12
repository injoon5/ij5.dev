import { describe, expect, it } from 'vitest';
import { RESERVED, SLUG_PATTERN, isSlugCandidate } from './reserved';

/**
 * §13, test 1a — a reserved slug can never be created, and the hook's three
 * guards do the work claimed for them.
 *
 * These guards are load-bearing twice over: the hook skips the KV read for
 * anything they reject, and slug creation refuses the same names. Testing the
 * shared predicate is what keeps those two from drifting apart.
 */

describe('isSlugCandidate', () => {
	it('accepts a plain single segment', () => {
		expect(isSlugCandidate('gh')).toBe(true);
		expect(isSlugCandidate('read-this_2')).toBe(true);
	});

	it('rejects multi-segment paths, so /a/b never reaches KV', () => {
		expect(isSlugCandidate('a/b')).toBe(false);
	});

	it('rejects dotted paths, so static assets cost no KV read', () => {
		for (const asset of ['robots.txt', 'favicon.ico', 'og.png', 'manifest.webmanifest']) {
			expect(isSlugCandidate(asset)).toBe(false);
		}
	});

	it('rejects the empty path', () => {
		expect(isSlugCandidate('')).toBe(false);
	});

	it('rejects every reserved name', () => {
		for (const name of RESERVED) expect(isSlugCandidate(name)).toBe(false);
	});

	it('reserves login, so a slug cannot shadow the sign-in page', () => {
		expect(RESERVED.has('login')).toBe(true);
		expect(isSlugCandidate('login')).toBe(false);
	});
});

describe('SLUG_PATTERN', () => {
	it('accepts what survives a URL unedited', () => {
		expect(SLUG_PATTERN.test('gh')).toBe(true);
		expect(SLUG_PATTERN.test('a_b-c9')).toBe(true);
	});

	it('rejects anything that would need encoding, or a leading separator', () => {
		for (const bad of ['-lead', '_lead', 'a b', 'a.b', 'a/b', 'ünicode', '..', '']) {
			expect(SLUG_PATTERN.test(bad)).toBe(false);
		}
	});

	it('caps length at 64 characters', () => {
		expect(SLUG_PATTERN.test('a'.repeat(64))).toBe(true);
		expect(SLUG_PATTERN.test('a'.repeat(65))).toBe(false);
	});
});
