import { describe, expect, it } from 'vitest';
import { asciiName, cleanName, contentDisposition, parseRange, randomFileSlug } from './files';
import { SLUG_PATTERN } from '$lib/reserved';

/**
 * The pure parts of file sharing: the random slug must be typeable and valid
 * as a slug, and a filename must survive its trip into a Content-Disposition
 * header and a page title.
 */

describe('randomFileSlug', () => {
	it('is a valid slug of the requested length', () => {
		for (let i = 0; i < 50; i++) {
			const slug = randomFileSlug();
			expect(slug).toHaveLength(8);
			expect(SLUG_PATTERN.test(slug)).toBe(true);
		}
	});

	it('never uses ambiguous characters', () => {
		expect(randomFileSlug()).not.toMatch(/[ilo01]/);
	});
});

describe('contentDisposition', () => {
	it('keeps the header ASCII so a non-Latin name cannot fail the download', () => {
		const header = contentDisposition('보고서 final.pdf');
		expect(header).toMatch(/^[\x20-\x7e]+$/);
		expect(() => new Headers({ 'content-disposition': header })).not.toThrow();
	});

	it('carries the real name in the RFC 5987 form', () => {
		expect(contentDisposition('보고서.pdf')).toContain(`filename*=UTF-8''${encodeURIComponent('보고서.pdf')}`);
		expect(asciiName('보고서.pdf')).toBe('___.pdf');
	});
});

describe('cleanName', () => {
	it('strips path separators so a name cannot escape a header', () => {
		expect(cleanName('../../etc/passwd')).not.toContain('/');
		expect(cleanName('a\\b.txt')).not.toContain('\\');
	});

	it('removes quotes and control characters', () => {
		expect(cleanName('say "hi".txt\n')).toBe('say hi.txt');
	});

	it('caps length and never returns empty', () => {
		expect(cleanName('x'.repeat(500))).toHaveLength(255);
		expect(cleanName('   ')).toBe('file');
	});
});

describe('parseRange', () => {
	it('reads a closed, an open and a suffix range', () => {
		expect(parseRange('bytes=0-99', 1000)).toEqual({ offset: 0, length: 100 });
		expect(parseRange('bytes=900-', 1000)).toEqual({ offset: 900, length: 100 });
		expect(parseRange('bytes=-10', 1000)).toEqual({ offset: 990, length: 10 });
	});

	it('clamps an end past the file to its last byte', () => {
		expect(parseRange('bytes=990-5000', 1000)).toEqual({ offset: 990, length: 10 });
	});

	it('refuses a start past the end', () => {
		expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
	});

	it('serves the whole file for anything it does not understand', () => {
		expect(parseRange(null, 1000)).toBeNull();
		expect(parseRange('bytes=0-1,5-9', 1000)).toBeNull();
		expect(parseRange('items=0-1', 1000)).toBeNull();
		expect(parseRange('bytes=50-10', 1000)).toBeNull();
	});
});
