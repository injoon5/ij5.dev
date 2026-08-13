import { describe, expect, it } from 'vitest';
import { renderMarkdown, findLiveRequests, imageKeysIn } from './markdown';

const ORIGIN = 'https://assets.example.com';

describe('renderMarkdown — prose', () => {
	it('renders CommonMark and marks external links safe', () => {
		const { html } = renderMarkdown('A [site](https://example.com) and **bold**.', {
			assetsOrigin: ORIGIN
		});
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener"');
	});

	it('escapes raw HTML rather than passing it through', () => {
		const { html } = renderMarkdown('<script>alert(1)</script>', { assetsOrigin: ORIGIN });
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});

describe('renderMarkdown — images', () => {
	it('resolves an img/ key against the assets origin and reserves its box', () => {
		const dims = new Map([['img/abc123.webp', { w: 800, h: 600 }]]);
		const { html, needsScript } = renderMarkdown('![a cat](img/abc123.webp)', {
			assetsOrigin: ORIGIN,
			dims
		});
		expect(html).toContain(`src="${ORIGIN}/img/abc123.webp"`);
		expect(html).toContain('width="800"');
		expect(html).toContain('height="600"');
		expect(html).toContain('loading="lazy"');
		// An image is the one thing that makes the page ask for w.js.
		expect(needsScript).toBe(true);
	});

	it('leaves an absolute image URL untouched', () => {
		const { html } = renderMarkdown('![x](https://cdn.example.com/x.png)', { assetsOrigin: ORIGIN });
		expect(html).toContain('src="https://cdn.example.com/x.png"');
	});

	it('needs no script when there are no images', () => {
		const { needsScript } = renderMarkdown('# Just words', { assetsOrigin: ORIGIN });
		expect(needsScript).toBe(false);
	});
});

describe('renderMarkdown — inline icons', () => {
	it('renders a known mark as inline SVG', () => {
		const { html } = renderMarkdown('Find me on :github: today.', { assetsOrigin: ORIGIN });
		expect(html).toContain('<svg');
		expect(html).toContain('class="md-icon"');
	});

	it('leaves an unknown name as literal text', () => {
		const { html } = renderMarkdown('a :nope: b', { assetsOrigin: ORIGIN });
		expect(html).toContain(':nope:');
		expect(html).not.toContain('md-icon');
	});
});

describe('renderMarkdown — link buttons', () => {
	it('renders a :::links block as icon buttons and drops unsafe rows', () => {
		const src = [
			':::links',
			'github | GitHub | https://github.com/x | code',
			'mail | Email | mailto:x@example.com',
			'globe | Bad | javascript:alert(1)',
			':::'
		].join('\n');
		const { html } = renderMarkdown(src, { assetsOrigin: ORIGIN });
		expect(html).toContain('class="link-buttons" aria-label="Links"');
		expect(html).toContain('class="widget link-button"');
		expect(html).toContain('GitHub');
		expect(html).toContain('mailto:x@example.com');
		// The javascript: row is rejected, not rendered.
		expect(html).not.toContain('javascript:');
	});
});

describe('renderMarkdown — photo gallery', () => {
	it('renders a :::gallery block as a grid, resolving img/ keys', () => {
		const dims = new Map([['img/abc123.webp', { w: 800, h: 600 }]]);
		const src = [':::gallery', 'img/abc123.webp | A cat', 'img/def456.webp', ':::'].join('\n');
		const { html, needsScript } = renderMarkdown(src, { assetsOrigin: ORIGIN, dims });
		expect(html).toContain('class="gallery"');
		expect(html).toContain('data-cols="2"');
		expect(html).toContain(`src="${ORIGIN}/img/abc123.webp"`);
		expect(html).toContain('width="800"');
		expect(html).toContain('A cat');
		// Images make the page ask for w.js, exactly like a prose image.
		expect(needsScript).toBe(true);
	});

	it('honours cols=N clamped to 1–4', () => {
		const src = ':::gallery cols=9\nimg/a.webp\n:::';
		const { html } = renderMarkdown(src, { assetsOrigin: ORIGIN });
		expect(html).toContain('data-cols="4"');
	});

	it('leaves an absolute image URL untouched and drops junk rows', () => {
		const src = [':::gallery', 'https://cdn.example.com/x.png', 'not-an-image', ':::'].join('\n');
		const { html } = renderMarkdown(src, { assetsOrigin: ORIGIN });
		expect(html).toContain('src="https://cdn.example.com/x.png"');
		expect(html).not.toContain('not-an-image');
	});

	it('renders nothing for an empty gallery', () => {
		const { html } = renderMarkdown(':::gallery\n:::', { assetsOrigin: ORIGIN });
		expect(html).not.toContain('class="gallery"');
	});
});

describe('renderMarkdown — contribution graph', () => {
	it('renders the graph from live data keyed by the shortcode id', () => {
		const live = {
			'grass:octocat': {
				at: Date.now(),
				data: { total: 1234, days: [{ d: '2026-01-01', c: 3, l: 2 }] }
			}
		};
		const { html } = renderMarkdown('::contributions user=octocat', { assetsOrigin: ORIGIN, live });
		expect(html).toContain('class="contrib"');
		expect(html).toContain('1,234 contributions');
		expect(html).toContain('href="/gh"');
	});

	it('falls back to an empty lattice with no data', () => {
		const { html } = renderMarkdown('::contributions user=octocat', { assetsOrigin: ORIGIN });
		expect(html).toContain('class="contrib"');
		expect(html).toContain('octocat on GitHub');
	});
});

describe('findLiveRequests', () => {
	it('discovers contribution shortcodes and dedupes by user', () => {
		const src = '::contributions user=octocat\n\ntext\n\n::contributions user=octocat';
		const reqs = findLiveRequests(src);
		expect(reqs).toHaveLength(1);
		expect(reqs[0]).toEqual({ id: 'grass:octocat', kind: 'grass', data: { user: 'octocat' } });
	});

	it('uses the default user when none is given', () => {
		const reqs = findLiveRequests('::contributions', 'defaultuser');
		expect(reqs[0].data.user).toBe('defaultuser');
	});

	it('returns nothing when the document has no shortcodes', () => {
		expect(findLiveRequests('# just prose')).toHaveLength(0);
	});
});

describe('imageKeysIn', () => {
	it('extracts every img/ key referenced by the document', () => {
		const src = '![a](img/aaa111.webp) and ![b](img/bbb222.png) and ![a again](img/aaa111.webp)';
		expect(imageKeysIn(src).sort()).toEqual(['img/aaa111.webp', 'img/bbb222.png']);
	});

	it('ignores absolute URLs', () => {
		expect(imageKeysIn('![x](https://example.com/y.png)')).toHaveLength(0);
	});
});
