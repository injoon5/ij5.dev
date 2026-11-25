import type { RequestHandler } from './$types';
import { getLivePaste, pasteCacheControl } from '$lib/pastes/pastes.server';
import { track } from '$lib/analytics/track.server';
import { bindings } from '$lib/server/bindings';

/** A paste as `text/plain`, so `curl ij5.dev/raw/{slug}` just works. */
export const GET: RequestHandler = async (event) => {
	const paste = await getLivePaste(bindings(event.platform), event.params.slug);
	if (!paste) return new Response('No paste with that slug.', { status: 404 });

	track(event, { slug: paste.slug, kind: 'paste' });

	return new Response(paste.body, {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': pasteCacheControl(paste) }
	});
};
