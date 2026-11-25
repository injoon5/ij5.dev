import type { Handle } from '@sveltejs/kit';
import { track } from '$lib/analytics/track.server';
import { HOME_SLUG } from '$lib/analytics/visit';
import { afterResponse } from '$lib/server/bindings';
import { HOME_KEYS, type HomeDoc } from './types';

const DEV = import.meta.env.DEV;
// Replaced at build time (`vite.config.ts`) with the commit being deployed, so
// a deploy — which does not bump the document version — still misses the cache.
const BUILD_ID = import.meta.env.VITE_BUILD_ID;

/**
 * The homepage, rendered once per published version per deploy. A TTL would
 * be wrong: `cache.delete()` only reaches one colo, so an edit would linger
 * elsewhere. A version-keyed entry makes every colo miss at once.
 */
const cacheKey = (v: number) => new Request(`https://cache.internal/home/v${v}/b${BUILD_ID}/html`);

const isHtml = (res: Response) => res.headers.get('content-type')?.startsWith('text/html') ?? false;

/**
 * What the browser gets is never cached anywhere else. `no-store`, not
 * `private`: the zone has a cache rule that was observed caching `/` under
 * `private` for hours, and `no-store` also keeps the adapter from caching it
 * under the public URL.
 */
function uncacheable(res: Response) {
	const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
	out.headers.set('Cache-Control', 'no-store');
	out.headers.set('CDN-Cache-Control', 'no-store');
	return out;
}

export const serveHome: Handle = async ({ event, resolve }) => {
	const { platform, request } = event;
	const read = request.method === 'GET' || request.method === 'HEAD';
	// A client-side navigation fetches `/__data.json`, which arrives here as
	// `/`. Caching it under the HTML key once poisoned the site.
	if (!platform || event.url.pathname !== '/' || !read || event.isDataRequest) return resolve(event);

	// Before the cache check: a cache hit is still a visit.
	track(event, { slug: HOME_SLUG, kind: 'home' });

	const doc = await platform.env.KV.get<HomeDoc>(HOME_KEYS.published, { type: 'json', cacheTtl: 60 }).catch(() => null);
	if (!doc) return resolve(event);
	event.locals.home = doc;
	// `vite dev` re-renders every time, or template edits would be invisible
	// until the next publish or deploy.
	if (DEV) return resolve(event);

	const cache = platform.caches?.default;
	const key = cacheKey(doc.v);
	const cached = await cache?.match(key);
	if (cached && isHtml(cached)) return uncacheable(cached);

	const res = await resolve(event);
	// GET only: a HEAD response has no body, and the entry is shared.
	if (cache && request.method === 'GET' && res.status === 200 && isHtml(res)) {
		const store = new Response(res.clone().body, { status: 200, headers: new Headers(res.headers) });
		store.headers.delete('set-cookie');
		store.headers.set('Cache-Control', 'public, s-maxage=31536000');
		afterResponse(platform, cache.put(key, store));
	}
	return uncacheable(res);
};
