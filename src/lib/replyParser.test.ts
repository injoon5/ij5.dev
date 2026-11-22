import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseReply, slugify } from './replyParser';

/**
 * The parser against every shared fixture (Shelf plan §9.4). The Swift copy
 * in Shelf runs the same files, so a case that passes here and fails there is
 * drift between the two copies — fix the copy, never the fixture alone. The
 * rules themselves are written out in `fixtures/replies/README.md`.
 */

const DIR = fileURLToPath(new URL('../../fixtures/replies/', import.meta.url));
const cases = readdirSync(DIR)
	.filter((f) => f.endsWith('.md') && f !== 'README.md')
	.map((f) => f.slice(0, -3))
	.sort();

describe('parseReply fixtures', () => {
	it('has the cases the README promises', () => {
		expect(cases.length).toBeGreaterThanOrEqual(13);
	});

	it.each(cases)('%s', (name) => {
		const input = readFileSync(`${DIR}${name}.md`, 'utf8');
		const expected = JSON.parse(readFileSync(`${DIR}${name}.json`, 'utf8'));
		expect(parseReply(input)).toEqual(expected);
	});
});

describe('parseReply', () => {
	it('never leaves a carriage return in the source', () => {
		expect(parseReply('// Name: A\r\rbody\r\n').source).toBe('// Name: A\n\nbody\n');
	});

	it('drops a leading byte-order mark so the header is still read', () => {
		expect(parseReply('﻿// Name: Bom\nx\n').name).toBe('Bom');
	});

	it('returns an empty source for a reply with nothing in it', () => {
		expect(parseReply('```swift\n\n```').source).toBe('');
	});
});

describe('slugify', () => {
	it('folds, lowercases and hyphenates', () => {
		expect(slugify('Café Crème')).toBe('cafe-creme');
		expect(slugify('  --Hello__World--  ')).toBe('hello-world');
	});

	it('never ends in a hyphen after the cut', () => {
		const slug = slugify(`${'a'.repeat(63)} b`);
		expect(slug).toBe('a'.repeat(63));
	});

	it('falls back to "app"', () => {
		expect(slugify(null)).toBe('app');
		expect(slugify('!!!')).toBe('app');
	});
});
