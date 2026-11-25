import type { PageServerLoad } from './$types';
import { currentHome } from '$lib/home/home.server';
import { planRefresh, readLive } from '$lib/home/live.server';
import { renderMarkdown, findLiveRequests } from '$lib/home/markdown';
import { imageKeysIn } from '$lib/home/assetKeys';
import { assetDims } from '$lib/home/assets.server';
import { bindings, afterResponse } from '$lib/server/bindings';

export const load: PageServerLoad = async ({ platform, locals, url }) => {
	const env = bindings(platform);

	// The hook already read the published document to build the cache key.
	const doc = await currentHome(env, locals.home);
	const markdown = doc.markdown;

	const live = await readLive(env).catch((e: unknown) => {
		console.error('live data read failed:', e);
		return null;
	});
	const refresh = planRefresh(findLiveRequests(markdown), live, env);
	if (refresh) afterResponse(platform, refresh());

	const assetsOrigin = env.ASSETS_ORIGIN ?? '';
	// Missing sizes only cost a little layout shift, never the page.
	const dims = await assetDims(env, imageKeysIn(markdown)).catch((e: unknown) => {
		console.error('image sizes failed:', e);
		return new Map();
	});
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
