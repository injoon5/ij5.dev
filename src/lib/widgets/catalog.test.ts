import { describe, expect, it } from 'vitest';
import { hasLiveBlock, widgets, type WidgetKind } from './catalog';
import type { Block } from '$lib/types';

/**
 * The `/` hook keys its HTML cache on the document version and holds an entry
 * for a year. That is only sound when a version change is the only thing that
 * can stale the HTML — which stops being true the moment a live widget is on
 * the page, because it rewrites the shared `live` KV behind the response
 * without bumping the version. `hasLiveBlock` is what keeps such a page out of
 * that cache, so this guards the classification the whole scheme rests on.
 */

const block = (kind: string): Block => ({ id: kind, ord: 0, kind, span: '1x1', data: {} });

describe('hasLiveBlock', () => {
	it('is false for a page of only static blocks', () => {
		expect(hasLiveBlock([block('text'), block('stat'), block('link')])).toBe(false);
	});

	it('is true as soon as one live widget is present', () => {
		expect(hasLiveBlock([block('text'), block('weather'), block('stat')])).toBe(true);
	});

	it('flags every live-tier kind in the catalog', () => {
		const live = (Object.keys(widgets) as WidgetKind[]).filter((k) => widgets[k].tier === 'live');
		// If a new live widget is added, it must be caught here too — otherwise it
		// would silently render behind a year-long cache and never refresh.
		expect(live.length).toBeGreaterThan(0);
		for (const kind of live) {
			expect(hasLiveBlock([block(kind)])).toBe(true);
		}
	});

	it('ignores an unknown kind rather than treating it as live', () => {
		expect(hasLiveBlock([block('not-a-widget')])).toBe(false);
	});

	it('is false for an empty page', () => {
		expect(hasLiveBlock([])).toBe(false);
	});
});
