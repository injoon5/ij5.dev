import type { Handle } from '@sveltejs/kit';
import { isSlugCandidate } from '$lib/reserved';
import { valid, SESSION_COOKIE } from '$lib/server/auth';
import { track } from '$lib/server/track';
import type { HomeDoc, SlugRecord } from '$lib/types';

/**
 * SvelteKit owns the request but not the redirect (§2).
 *
 * `/:slug` short-circuits before `resolve()`: it must not pay route
 * resolution, layout loading, or render bootstrap. Everything imported at the
 * top of this file is evaluated at startup on *every* request, redirects
 * included — so the import graph here stays deliberately small and anything
 * heavier is imported dynamically inside the branch that needs it.
 */

const REDIRECT_TTL = 300;
const DEV = import.meta.env.DEV;

/** Query-independent, so `/gh?utm_source=x` and `/gh` share one cache entry. */
const slugCacheKey = (seg: string) => new Request(`https://cache.internal/s/${seg}`);
const homeCacheKey = (v: number) => new Request(`https://cache.internal/home/v${v}/html`);

/**
 * A second, deliberately narrow policy. `frame-ancestors` and `base-uri` are
 * ignored inside a <meta> tag, which is how SvelteKit may deliver the main
 * policy configured in `svelte.config.js`. Two policies are both enforced.
 */
const SECURITY_HEADERS: Array<[string, string]> = [
	['Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'"],
	['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
	['X-Content-Type-Options', 'nosniff'],
	// Still sends the origin cross-site, which is exactly what the
	// hostname-only referrer capture in §6 needs.
	['Referrer-Policy', 'strict-origin-when-cross-origin'],
	['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()']
];

function harden(res: Response) {
	for (const [k, v] of SECURITY_HEADERS) res.headers.set(k, v);
	return res;
}

export const handle: Handle = async ({ event, resolve }) => {
	const platform = event.platform;
	const env = platform?.env;
	const cache = platform?.caches?.default;
	const path = event.url.pathname;
	const seg = path.slice(1);
	const method = event.request.method;
	// A redirect answers a navigation. Anything else arriving at a slug is a
	// scanner, and answering it with a 302 would file the probe as a click.
	const readOnly = method === 'GET' || method === 'HEAD';

	// ---------------------------------------------------------------- redirect
	// Single-segment and dot-free: `/a/b` never reaches KV, and neither does
	// robots.txt, favicon.ico or og.png.
	if (env && readOnly && isSlugCandidate(seg)) {
		const key = slugCacheKey(seg);

		try {
			const cached = await cache?.match(key);
			if (cached) {
				track(event, { slug: seg, kind: 'redirect' });
				return cached;
			}

			const hit = await env.KV.get<SlugRecord>(`slug:${seg}`, {
				type: 'json',
				// Without this a colo that has not seen the key recently reads
				// from central storage on every miss.
				cacheTtl: REDIRECT_TTL
			});

			if (hit?.target && (!hit.exp || hit.exp > Date.now())) {
				const res = new Response(null, {
					status: hit.status ?? 302,
					headers: {
						Location: hit.target,
						// `s-maxage`, not `max-age`: the edge caches, the browser
						// does not. A private browser cache would keep sending a
						// visitor to the old target after a repoint, with no way
						// to reach them.
						'Cache-Control': `s-maxage=${REDIRECT_TTL}, max-age=0`
					}
				});
				track(event, { slug: seg, kind: 'redirect' });
				platform?.context?.waitUntil?.(cache?.put(key, res.clone()) ?? Promise.resolve());
				return res;
			}

			// Miss, or expired. Expiry is lazy — `exp` rides in the KV value and
			// the D1 row survives for history.
			track(event, { slug: seg, kind: '404' });
		} catch {
			// §13 — a KV failure on this path is a 404, never a 500.
			track(event, { slug: seg, kind: '404' });
		}
	}

	// ------------------------------------------------------------------- home
	// Caching rendered HTML on a TTL would be wrong here: `cache.delete()`
	// purges only the colo it runs in, so an edit would leave other regions
	// serving stale content. A version-keyed entry makes every colo miss at
	// once, with nothing to purge.
	if (env && path === '/' && readOnly) {
		// A `__data.json` request (the client router's navigation fetch) arrives
		// here with its suffix already stripped, so `path` is `/`. It must
		// bypass this whole block and answer straight from `resolve()`: caching
		// a data response under the home key is what poisoned the site, serving
		// the cached HTML back to it makes client-side navigation explode on
		// `response.json()`, and `browserFacing()`'s public Cache-Control would
		// let the adapter layer cache it under the public URL. `isDataRequest`
		// is the reliable discriminator — the client sends `Accept: */*`, not
		// `application/json`.
		if (event.isDataRequest) return harden(await resolve(event));
		// Outside the KV read and above the cache check, deliberately. A cache
		// hit is still a visit, and so is a visit to a homepage that has never
		// been published — that page renders from D1 and used to be counted
		// nowhere, which silently zeroed the numbers for the page that matters
		// most until someone happened to press Publish.
		track(event, { slug: '', kind: 'home' });

		try {
			const doc = await env.KV.get<HomeDoc>('home', { type: 'json', cacheTtl: 60 });
			// A document that predates the Markdown format carries `blocks`, not
			// `markdown`. Treating it as published would cache an empty body
			// under its old version key forever — fall through to the normal
			// render instead, which falls back to D1.
			if (doc?.markdown) {
				const etag = `"home-v${doc.v}"`;
				const key = homeCacheKey(doc.v);
				// `vite dev` must re-render on every request. The cache key only
				// moves on publish, so a template or CSS edit would otherwise
				// sit behind the last HTML until `v` bumped — and a matching
				// ETag would 304 the browser even after a hard refresh.
				if (!DEV) {
					if (event.request.headers.get('if-none-match') === etag) {
						return harden(
							new Response(null, {
								status: 304,
								headers: { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' }
							})
						);
					}

					const cached = await cache?.match(key);
					// Defense in depth: only ever serve HTML out of this key. A
					// data response that somehow lands here must not reach a
					// browser — skipping it makes the next HTML request render
					// fresh and overwrite the entry under the same key.
					if (cached && isHtml(cached)) return harden(browserFacing(cached, etag));
				}

				event.locals.home = doc;
				const res = await resolve(event);
				// Store from GET only. A HEAD is served from an entry a GET put
				// there, but must never be the request that fills it: the entry is
				// shared, and a body-less response in it would blank the page for
				// everyone else until the next publish.
				if (!DEV && res.status === 200 && isHtml(res) && cache && method === 'GET') {
					const copy = res.clone();
					const store = new Response(copy.body, {
						status: 200,
						headers: new Headers(copy.headers)
					});
					store.headers.delete('set-cookie');
					// The key is version-scoped, so staleness is impossible and
					// the entry can live as long as the colo will keep it.
					store.headers.set('Cache-Control', 'public, s-maxage=31536000');
					platform?.context?.waitUntil?.(cache.put(key, store));
				}
				return harden(DEV ? res : browserFacing(res, etag));
			}
		} catch {
			// Fall through to a normal render; the page load falls back to D1.
		}
	}

	// ------------------------------------------------------------------- auth
	event.locals.authed = await valid(event.cookies.get(SESSION_COOKIE), env?.SESSION_SECRET);

	/**
	 * `/api` has no `+layout.server.ts`, so it guards here — but only the
	 * cookie-authenticated half.
	 *
	 * `/api/links` authenticates itself with a bearer token and deliberately
	 * does *not* accept the session cookie: a cookie is attached by the browser
	 * to whatever request the browser is talked into making, which is the whole
	 * of CSRF, while a bearer token has to be supplied by the caller. Letting
	 * the cookie in here would hand any page on any origin the shortener.
	 *
	 * `/api/passkey/login/*` are the two steps of passkey sign-in. They are the
	 * login page's own start: a session is exactly what the caller does not
	 * have yet, so guarding them with one would lock the door from outside.
	 * Everything else under `/api` — today, registration and the binary asset
	 * upload — is called by the admin UI with the session and is guarded here.
	 *
	 * The prefix is matched with its trailing slash. `startsWith('/api')` also
	 * matches `/apitest`, `/apiary` and every other slug that happens to begin
	 * with those four letters — which meant a miss on one of them answered 401
	 * instead of the designed 404 page.
	 */
	const isApi = path === '/api' || path.startsWith('/api/');
	const isBearerApi = path === '/api/links' || path.startsWith('/api/links/');
	const isPasskeyLogin =
		path === '/api/passkey/login/begin' || path === '/api/passkey/login/complete';

	if (isApi && !isBearerApi && !isPasskeyLogin && !event.locals.authed) {
		return new Response('Unauthorized', { status: 401 });
	}

	return harden(await resolve(event));
};

function isHtml(res: Response) {
	return res.headers.get('content-type')?.startsWith('text/html') ?? false;
}

/**
 * The internal, version-keyed edge cache does the real work, so what the
 * browser gets stays conservative — an unchanged homepage then costs a 304
 * with no body. `private` is deliberate: it keeps the adapter's worktop layer
 * (which caches any `Cache-Control` response under the public URL) from
 * storing a copy that survives the version key and masks a future publish.
 */
function browserFacing(res: Response, etag: string) {
	const out = new Response(res.body, {
		status: res.status,
		statusText: res.statusText,
		headers: new Headers(res.headers)
	});
	out.headers.set('Cache-Control', 'private, max-age=0, must-revalidate');
	out.headers.set('ETag', etag);
	return out;
}
