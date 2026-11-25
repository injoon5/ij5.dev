import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getLivePaste, pasteCacheControl } from '$lib/pastes/pastes.server';
import { track } from '$lib/analytics/track.server';
import { bindings } from '$lib/server/bindings';

/**
 * The paste view. The `.svelte` component HTML-escapes the body by
 * construction. An `s-maxage` here makes adapter-cloudflare serve the page
 * from the Cache API keyed by the URL, so a cache hit never reaches this load
 * and is not counted.
 */
export const load: PageServerLoad = async (event) => {
	const { params, platform, url } = event;
	const paste = await getLivePaste(bindings(platform), params.slug);
	if (!paste) error(404, 'No paste with that slug.');

	if (!event.isDataRequest) track(event, { slug: params.slug, kind: 'paste' });
	event.setHeaders({ 'cache-control': pasteCacheControl(paste) });

	return { paste, origin: url.origin };
};
