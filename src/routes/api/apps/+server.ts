import type { RequestHandler } from './$types';
import { apiError, authorize } from '$lib/server/api';
import { appsEtag, etagMatches, listApps } from '$lib/apps/apps.server';
import { bindings } from '$lib/server/bindings';

/**
 * The app index Shelf syncs on every launch. Metadata only — the
 * query never reads `source` — with a strong ETag over the whole body, so a
 * launch with nothing new costs one 304 and no D1 read beyond the list.
 */

export const GET: RequestHandler = async ({ request, platform }) => {
	const env = bindings(platform);

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const apps = await listApps(env);
	const etag = await appsEtag(apps);
	// `no-store` like every API answer: the phone keeps its own copy and sends
	// `If-None-Match` itself, and nothing in between should hold a list that
	// only the bearer may read.
	const headers = { ETag: etag, 'cache-control': 'no-store' };

	if (etagMatches(request.headers.get('if-none-match'), etag)) {
		return new Response(null, { status: 304, headers });
	}

	return Response.json({ apps }, { headers });
};
