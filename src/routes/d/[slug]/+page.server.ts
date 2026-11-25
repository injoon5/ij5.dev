import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getLiveFile } from '$lib/files/files.server';
import { bindings } from '$lib/server/bindings';

/**
 * The download landing page. Existence and expiry are judged here on the
 * server; the bytes live one route down at `/d/{slug}/file`.
 */

export const load: PageServerLoad = async (event) => {
	const { params, platform, url } = event;
	const env = bindings(platform);

	const file = await getLiveFile(env, params.slug);
	if (!file) error(404, 'No file with that slug.');

	// The page carries the download count, so it is always served fresh.
	event.setHeaders({ 'cache-control': 'no-store' });

	return { file, origin: url.origin };
};
