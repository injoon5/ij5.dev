import type { RequestHandler } from './$types';
import { getPaste } from '$lib/server/pastes';
import { track } from '$lib/server/track';

/**
 * The stable raw URL for a paste: `ij5.dev/raw/{slug}` returns the body as
 * `text/plain`, for piping into a terminal. Two segments, so the hook's
 * single-segment fast path never sees it — this resolves through SvelteKit
 * and the same D1 source of truth the admin edits.
 *
 * The bare slug already serves raw text to anything that does not ask for
 * HTML (`?raw=1`, or an Accept header with no `text/html` — i.e. curl); this
 * route exists so the raw URL is stable and predictable rather than a header
 * negotiation.
 */

const TTL = 300;

export const GET: RequestHandler = async (event) => {
	const { params, platform } = event;
	const env = platform?.env;
	if (!env) return new Response('Unavailable', { status: 503 });

	const paste = await getPaste(env, params.slug);
	if (!paste) return new Response('No paste with that slug.', { status: 404 });
	if (paste.expires_at && paste.expires_at < Date.now()) {
		return new Response('That paste has expired.', { status: 404 });
	}

	track(event, { slug: params.slug, kind: 'paste' });

	return new Response(paste.body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			// A cache-disabled paste is never cached here either.
			'cache-control': paste.cache ? `public, s-maxage=${TTL}, max-age=0` : 'no-store'
		}
	});
};
