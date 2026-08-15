import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getFile } from '$lib/server/files';

/**
 * The download landing page. Existence and expiry are judged here on the
 * server; the bytes live one route down at `/d/{slug}/file`.
 */

export const load: PageServerLoad = async (event) => {
	const { params, platform, url } = event;
	const env = platform?.env;
	if (!env) throw error(503, 'Unavailable.');

	const file = await getFile(env, params.slug);
	if (!file) throw error(404, 'No file with that slug.');
	if (file.expires_at && file.expires_at < Date.now()) {
		throw error(404, 'That file has expired.');
	}

	// The page carries the download count, so it is always served fresh.
	event.setHeaders({ 'cache-control': 'no-store' });

	return { file, origin: url.origin };
};
