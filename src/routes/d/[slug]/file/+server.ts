import type { RequestHandler } from './$types';
import { bumpDownloads, getFile } from '$lib/server/files';

/**
 * The bytes. Streamed from R2 with `Content-Disposition: attachment`, so the
 * browser always downloads rather than renders — which is what makes the
 * client-declared MIME safe to pass through. Expiry is judged lazily here
 * too, the same way the landing page judges it.
 */

const TTL = 300;

export const GET: RequestHandler = async (event) => {
	const { params, platform } = event;
	const env = platform?.env;
	if (!env) return new Response('Unavailable', { status: 503 });

	const file = await getFile(env, params.slug);
	if (!file) return new Response('No file with that slug.', { status: 404 });
	if (file.expires_at && file.expires_at < Date.now()) {
		return new Response('That file has expired.', { status: 404 });
	}

	const obj = await env.BUCKET.get(file.key);
	if (!obj) return new Response('That file is gone.', { status: 404 });

	// Off the response path; a missed count is not worth a failed download.
	platform.context?.waitUntil?.(bumpDownloads(env, params.slug).catch(() => {}));

	return new Response(obj.body, {
		headers: {
			'content-type': file.mime || 'application/octet-stream',
			// ASCII fallback for strict clients, RFC 5987 for the real name.
			'content-disposition': `attachment; filename="${file.name}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
			'cache-control': `public, s-maxage=${TTL}, max-age=0`,
			'content-length': String(file.bytes)
		}
	});
};
