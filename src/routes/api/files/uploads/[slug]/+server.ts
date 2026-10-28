import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cleanName, fileKey, insertFileRow, parseExpiry, slugAvailable } from '$lib/server/files';
import { sameOrigin } from '$lib/server/origin';
import { MAX_PARTS, uploadLimits } from '$lib/uploads';

/**
 * The rest of a multipart upload, keyed by the slug its create step chose:
 *
 *   PUT    ?uploadId=…&part=N   one part, streamed straight into R2
 *   POST   { uploadId, parts, name, expires }   finish it and catalog it
 *   DELETE ?uploadId=…          give up; R2 discards the parts
 *
 * A part is never buffered: the request body is handed to R2 as a stream,
 * so a part costs the Worker almost no memory whatever its size — the
 * request-body limit of the zone's plan is the only cap, which is why parts
 * are sized under it (`$lib/uploads`). Uploads nobody finishes are aborted
 * by R2 itself after seven days.
 */

const fail = (status: number, message: string) => json({ message }, { status });

export const PUT: RequestHandler = async ({ request, params, platform, url }) => {
	const env = platform?.env;
	if (!env) return fail(503, 'No platform bindings.');
	if (!sameOrigin(request)) return fail(403, 'Cross-origin request refused.');

	const uploadId = url.searchParams.get('uploadId') ?? '';
	const part = Number(url.searchParams.get('part'));
	if (!uploadId || !Number.isInteger(part) || part < 1 || part > MAX_PARTS) {
		return fail(400, 'Missing upload or part number.');
	}

	// R2 needs a stream's length up front. `Content-Length` usually carries
	// it, but a proxy may re-send the body chunked and drop the header, so the
	// client states the part's size as well.
	const length = Number(
		request.headers.get('content-length') || request.headers.get('x-part-size')
	);
	if (!Number.isSafeInteger(length) || length <= 0 || !request.body) {
		return fail(411, 'A part needs its length.');
	}
	if (length > uploadLimits(env.UPLOAD_PART_MIB).maxPartBytes) return fail(413, 'That part is too large.');

	try {
		const upload = env.BUCKET.resumeMultipartUpload(fileKey(params.slug), uploadId);
		// A fixed-length stream tells R2 the size without reading the body
		// into memory, and errors if the bytes that arrive disagree with it.
		// It is a Workers global; `vite dev` runs this file in Node, where a
		// (small, local) part is simply read whole instead.
		const body =
			typeof FixedLengthStream === 'function'
				? request.body.pipeThrough(new FixedLengthStream(length))
				: await request.arrayBuffer();
		const uploaded = await upload.uploadPart(part, body);
		return json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
	} catch (e) {
		return fail(400, e instanceof Error ? e.message : 'That part could not be stored.');
	}
};

export const POST: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return fail(503, 'No platform bindings.');
	if (!sameOrigin(request)) return fail(403, 'Cross-origin request refused.');

	let body: { uploadId?: unknown; parts?: unknown; name?: unknown; expires?: unknown };
	try {
		body = await request.json();
	} catch {
		return fail(400, 'Body must be JSON.');
	}

	const uploadId = typeof body.uploadId === 'string' ? body.uploadId : '';
	const parts = Array.isArray(body.parts)
		? body.parts
				.map((p) => ({ partNumber: Number(p?.partNumber), etag: String(p?.etag ?? '') }))
				.filter((p) => Number.isInteger(p.partNumber) && p.etag)
				.sort((a, b) => a.partNumber - b.partNumber)
		: [];
	if (!uploadId || !parts.length) return fail(400, 'Missing upload or parts.');

	const key = fileKey(params.slug);
	const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);

	// The name is claimed now. If it went to something else while the bytes
	// were moving, the upload is thrown away rather than shadowing it.
	if (!(await slugAvailable(env, params.slug))) {
		await upload.abort().catch(() => {});
		return json({ fields: { slug: 'That name was taken while uploading.' } }, { status: 409 });
	}

	let object: Awaited<ReturnType<typeof upload.complete>>;
	try {
		object = await upload.complete(parts);
	} catch (e) {
		return fail(400, e instanceof Error ? e.message : 'The upload could not be completed.');
	}

	await insertFileRow(env, {
		slug: params.slug,
		name: cleanName(typeof body.name === 'string' ? body.name : ''),
		mime: object.httpMetadata?.contentType || 'application/octet-stream',
		bytes: object.size,
		expires_at: parseExpiry(typeof body.expires === 'string' ? body.expires : '')
	});

	return json({ slug: params.slug });
};

export const DELETE: RequestHandler = async ({ request, params, platform, url }) => {
	const env = platform?.env;
	if (!env) return fail(503, 'No platform bindings.');
	if (!sameOrigin(request)) return fail(403, 'Cross-origin request refused.');

	const uploadId = url.searchParams.get('uploadId') ?? '';
	if (!uploadId) return fail(400, 'Missing upload.');

	await env.BUCKET.resumeMultipartUpload(fileKey(params.slug), uploadId)
		.abort()
		.catch(() => {});
	return new Response(null, { status: 204 });
};
