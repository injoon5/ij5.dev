import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPaste } from '$lib/server/pastes';
import { track } from '$lib/server/track';

/**
 * The paste view, as a real page.
 *
 * Pastes live under `/p/{slug}` — a two-segment namespace, so the hook's
 * single-segment fast path never intercepts them and this page renders
 * through SvelteKit like everything else. The body is rendered by the
 * `.svelte` component, which HTML-escapes it by construction; the server only
 * checks existence and expiry, and sets the cache policy.
 *
 * Caching is the adapter's job: `s-maxage` on a cached paste makes
 * adapter-cloudflare serve the page from the Cache API keyed by the real URL,
 * and `no-store` (the cache toggle) makes every view a fresh render.
 */

const TTL = 300;

export const load: PageServerLoad = async (event) => {
	const { params, platform, url } = event;
	const env = platform?.env;
	if (!env) throw error(503, 'Unavailable.');

	const paste = await getPaste(env, params.slug);
	if (!paste) throw error(404, 'No paste with that slug.');
	if (paste.expires_at && paste.expires_at < Date.now()) {
		throw error(404, 'That paste has expired.');
	}

	// A cache hit never reaches this load, so cached views are under-counted
	// by design; an uncached view is a real visit either way.
	if (!event.isDataRequest) track(event, { slug: params.slug, kind: 'paste' });

	event.setHeaders({
		'cache-control': paste.cache ? `public, s-maxage=${TTL}, max-age=0` : 'no-store'
	});

	return { paste, origin: url.origin };
};
