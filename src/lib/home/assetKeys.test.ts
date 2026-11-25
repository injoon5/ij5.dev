import { describe, expect, it } from 'vitest';
import { imageKeysIn, isAssetKey } from './assetKeys';
import { renderMarkdown } from './markdown';

const ORIGIN = 'https://assets.example.com';

describe('imageKeysIn', () => {
	it('finds each key a document mentions, once', () => {
		const src = '![a](img/aaa111.webp) and ![b](img/bbb222.png) and ![a again](img/aaa111.webp)';
		expect(imageKeysIn(src).sort()).toEqual(['img/aaa111.webp', 'img/bbb222.png']);
	});

	it('ignores absolute URLs and does not swallow a sentence-ending dot', () => {
		expect(imageKeysIn('![x](https://example.com/y.png)')).toEqual([]);
		expect(imageKeysIn('see img/abc.png.')).toEqual(['img/abc.png']);
	});

	it('finds every image the renderer draws from the bucket, so cleanup never deletes one in use', () => {
		const keys = ['img/plain.webp', 'img/with.dots-and_more.png', 'img/gallery1.jpg'];
		const doc = `![a](${keys[0]})\n\n![b](${keys[1]})\n\n:::gallery\n${keys[2]} | caption\n:::`;
		const { html } = renderMarkdown(doc, { assetsOrigin: ORIGIN });
		const drawn = [...html.matchAll(/src="https:\/\/assets\.example\.com\/([^"]+)"/g)].map((m) => m[1]);
		expect(drawn.sort()).toEqual([...keys].sort());
		expect(imageKeysIn(doc).sort()).toEqual([...keys].sort());
		expect(drawn.every(isAssetKey)).toBe(true);
	});
});
