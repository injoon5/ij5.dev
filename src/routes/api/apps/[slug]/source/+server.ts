import type { RequestHandler } from './$types';
import { apiError, authorizeApp } from '$lib/server/api';
import { getSource } from '$lib/server/apps';

/**
 * The raw file, for `curl -o App.swift` (plan §9.5, Appendix D). With Include
 * Source off, Shelf's change prompt carries this command instead of the
 * source, so the source never enters the chat's history and an agent with a
 * shell still sees all of it. An update key may read its own slug here;
 * reading does not use the key up.
 */

export const GET: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorizeApp(request, env, { slug: params.slug, action: 'read-source' });
	if (!auth.ok) return apiError(auth.status, auth.error);

	const source = await getSource(env, params.slug);
	if (source === null) return apiError(404, 'No app with that slug.');

	return new Response(source, {
		headers: { 'content-type': 'text/x-swift; charset=utf-8', 'cache-control': 'no-store' }
	});
};
