import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RESERVED, SLUG_PATTERN, isSlugCandidate } from './slugs';

const ROUTES = fileURLToPath(new URL('../../routes/', import.meta.url));

describe('RESERVED', () => {
	it('covers every top-level route, so no link can shadow a page', () => {
		const topLevel = readdirSync(ROUTES, { withFileTypes: true })
			.filter((d) => d.isDirectory() && !d.name.includes('.'))
			.map((d) => d.name);
		expect(topLevel.filter((name) => !RESERVED.has(name))).toEqual([]);
	});
});

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

	it('rejects a reserved name', () => {
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
