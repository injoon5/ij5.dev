import { describe, expect, it } from 'vitest';
import { asciiName, cleanName, contentDisposition, randomFileSlug } from './files';
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
