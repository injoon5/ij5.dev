import type { PageServerLoad } from './$types';
import { currentHome } from '$lib/home/home.server';
import { planRefresh, readLive } from '$lib/home/live.server';
import { renderMarkdown, findLiveRequests } from '$lib/home/markdown';
import { imageKeysIn } from '$lib/home/assetKeys';
import { bindings, afterResponse } from '$lib/server/bindings';

/** Intrinsic dimensions, so each `<img>` reserves its box before it loads and
 *  the page holds CLS 0. */
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
	const env = bindings(platform);

	// The hook already read the published document to build the cache key.
	const doc = await currentHome(env, locals.home);
	const markdown = doc.markdown;

	let live = null;
	try {
		live = await readLive(env);
		const refresh = planRefresh(findLiveRequests(markdown), live, env);
		if (refresh) afterResponse(platform, refresh());
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
