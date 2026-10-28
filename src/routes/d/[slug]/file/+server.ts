import type { RequestHandler } from './$types';
import { bumpDownloads, contentDisposition, getFile, parseRange } from '$lib/server/files';

/**
 * The bytes. Streamed from R2 with `Content-Disposition: attachment`, so the
 * browser always downloads rather than renders — which is what makes the
 * client-declared MIME safe to pass through. Expiry is judged lazily here
 * too, the same way the landing page judges it.
 *
 * Deliberately `no-store`: a file download must be truthful. Caching the
 * bytes would keep serving a deleted or expired file for the cache TTL, and
 * it would swallow download counts (a cache hit never reaches this handler).
 * R2 serves from the edge anyway, so the only thing caching would buy is a
 * little latency.
 *
 * The body is streamed from R2, never buffered, so size is no concern here.
 */

export const GET: RequestHandler = async (event) => {
	const { params, platform } = event;
	const env = platform?.env;
	if (!env) return new Response('Unavailable', { status: 503 });

	const file = await getFile(env, params.slug);
	if (!file) return new Response('No file with that slug.', { status: 404 });
	if (file.expires_at && file.expires_at < Date.now()) {
		return new Response('That file has expired.', { status: 404 });
	}

	// Ranges, so a dropped multi-gigabyte download resumes where it stopped
	// instead of starting over. Parsed here against the stored size, then
	// asked of R2 as an explicit offset and length.
	const span = parseRange(event.request.headers.get('range'), file.bytes);
	if (span === 'unsatisfiable') {
		return new Response('That range is not in the file.', {
			status: 416,
			headers: { 'content-range': `bytes */${file.bytes}` }
		});
	}

	const obj = await env.BUCKET.get(file.key, span ? { range: span } : undefined);
	if (!obj) return new Response('That file is gone.', { status: 404 });

	const headers: Record<string, string> = {
		'content-type': file.mime || 'application/octet-stream',
		'content-disposition': contentDisposition(file.name),
		'cache-control': 'no-store',
		'accept-ranges': 'bytes',
		etag: obj.httpEtag
	};

	// A resumed or chunked download is still one download: count the request
	// that starts at the beginning, not every piece. Off the response path —
	// a missed count is not worth a failed download.
	if (!span || span.offset === 0) {
		platform.context?.waitUntil?.(bumpDownloads(env, params.slug).catch(() => {}));
	}

	if (span) {
		headers['content-range'] = `bytes ${span.offset}-${span.offset + span.length - 1}/${obj.size}`;
		headers['content-length'] = String(span.length);
		return new Response(obj.body, { status: 206, headers });
	}

	headers['content-length'] = String(obj.size);
	return new Response(obj.body, { headers });
};
