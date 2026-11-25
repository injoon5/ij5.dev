import type { Handle } from '@sveltejs/kit';
import { track } from '$lib/analytics/track.server';
import { isExpired } from '$lib/expiry';
import { isSlugCandidate } from '$lib/slugs/slugs';
import { afterResponse } from '$lib/server/bindings';
import { kvKey, redirectCacheKey, REDIRECT_TTL, type SlugRecord } from './link';

/**
 * `/{slug}` answers before SvelteKit routes anything: no route resolution, no
 * layout, no render. Edge cache first, then KV; D1 is never on this path.
 */
export const serveRedirect: Handle = async ({ event, resolve }) => {
	const { platform, request } = event;
	// `/gh/` is the same link as `/gh`; `/a/b` is never a link.
	const seg = event.url.pathname.slice(1).replace(/\/$/, '');
	// A redirect answers a navigation. Anything else arriving at a slug is a
	// scanner, and a 302 would file the probe as a click.
	const navigation = request.method === 'GET' || request.method === 'HEAD';
	if (!platform || !navigation || !isSlugCandidate(seg)) return resolve(event);

	const cache = platform.caches?.default;
	const key = redirectCacheKey(seg);
	try {
		const cached = await cache?.match(key);
		if (cached) {
			track(event, { slug: seg, kind: 'redirect' });
			return cached;
		}

		const hit = await platform.env.KV.get<SlugRecord>(kvKey(seg), {
			type: 'json',
			// Without this a colo that has not seen the key recently reads from
			// central storage on every miss.
			cacheTtl: REDIRECT_TTL
		});
		if (hit && !isExpired(hit.exp)) {
			const res = new Response(null, {
				status: hit.status,
				headers: {
					Location: hit.target,
					// The edge caches, the browser does not: a browser-cached 302
					// would keep sending a visitor to the old target after a repoint.
					'Cache-Control': `s-maxage=${REDIRECT_TTL}, max-age=0`
				}
			});
			track(event, { slug: seg, kind: 'redirect' });
			if (cache) afterResponse(platform, cache.put(key, res.clone()));
			return res;
		}
	} catch (e) {
		// A KV failure on this path is a 404, never a 500.
		console.error('redirect lookup failed:', e);
	}
	track(event, { slug: seg, kind: '404' });
	return resolve(event);
};
