import type { PageServerLoad } from './$types';
import { loadFromD1, readPublished } from '$lib/server/home';
import { planRefresh, readLive } from '$lib/server/live';
import { renderMarkdown, findLiveRequests, imageKeysIn } from '$lib/markdown';
import type { HomeDoc } from '$lib/types';

const EMPTY: HomeDoc = {
	v: 0,
	profile: { name: 'ij5', bio: null, tagline: null, avatar: null, links: [], content: null },
	markdown: ''
};

/** Intrinsic dimensions for the images the document references, so each `<img>`
 *  reserves its box before it loads and the page holds CLS 0. One query, only
 *  when the document actually has images. */
async function loadDims(
	env: App.Platform['env'],
	keys: string[]
): Promise<Map<string, { w: number; h: number }>> {
	const dims = new Map<string, { w: number; h: number }>();
	if (!keys.length) return dims;
	const placeholders = keys.map(() => '?').join(',');
	try {
		const res = await env.DB.prepare(
			`SELECT key, w, h FROM assets WHERE key IN (${placeholders})`
		)
			.bind(...keys)
			.all();
		for (const row of res.results as Array<{ key: string; w: number | null; h: number | null }>) {
			if (row.w && row.h) dims.set(row.key, { w: row.w, h: row.h });
		}
	} catch {
		// Missing dimensions only cost a little layout shift, never the page.
	}
	return dims;
}

export const load: PageServerLoad = async ({ platform, locals, url }) => {
	const env = platform?.env;
	if (!env) {
		const { html } = renderMarkdown(EMPTY.markdown, { assetsOrigin: '' });
		return {
			profile: EMPTY.profile,
			v: EMPTY.v,
			html,
			needsScript: false,
			assetsOrigin: '',
			publicOrigin: url.origin
		};
	}

	let doc: HomeDoc | null = null;
	try {
		// The hook already read this to build the cache key; reuse it rather than
		// paying a second KV read on the page that matters most.
		doc = locals.home ?? (await readPublished(env));
	} catch {
		doc = null;
	}

	if (!doc?.markdown) {
		// KV is unavailable, nothing has been published yet, or the published
		// document predates the Markdown format (the old one carried `blocks`,
		// not a body). All three are the same thing from here: fall back to the
		// source of truth rather than serving an error or a blank page.
		try {
			const { profile, markdown } = await loadFromD1(env);
			doc = { v: 0, profile, markdown };
		} catch {
			doc = EMPTY;
		}
	}

	const markdown = doc.markdown ?? '';

	// Read live data and, behind the response, refresh whatever the document's
	// shortcodes need and a TTL has aged out. Nobody waits on a third party.
	let live = null;
	try {
		live = await readLive(env);
		const refresh = planRefresh(findLiveRequests(markdown), live, env);
		if (refresh) platform.context?.waitUntil?.(refresh().catch(() => {}));
	} catch {
		live = null;
	}

	const assetsOrigin = env.ASSETS_ORIGIN ?? '';
	const dims = await loadDims(env, imageKeysIn(markdown));
	const { html, needsScript } = renderMarkdown(markdown, { assetsOrigin, live, dims });

	return {
		profile: doc.profile,
		v: doc.v,
		html,
		needsScript,
		assetsOrigin,
		// Absolute URLs are not optional in a share card — a preview is fetched by
		// a crawler with no page to resolve a relative path against. The configured
		// origin wins over the request's so a preview link or workers.dev URL still
		// points share traffic at the canonical host.
		publicOrigin: env.PUBLIC_ORIGIN || url.origin
	};
};
