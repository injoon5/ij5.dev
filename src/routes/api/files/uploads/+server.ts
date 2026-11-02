import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fileKey, freeRandomSlug, slugProblem } from '$lib/server/files';
import { sameOrigin } from '$lib/server/origin';
import { fmtBytes } from '$lib/format';
import { partSizeFor, uploadLimits } from '$lib/uploads';

/**
 * Step one of sharing a file: reserve a name and open a multipart upload in
 * R2. The browser then sends the file in parts (`[slug]` PUT) and finishes
 * it (`[slug]` POST). Session-guarded by the hook like everything under
 * `/api`; same-origin checked here, because SvelteKit's own CSRF check only
 * covers form posts.
 *
 * The name is checked now so a taken slug fails before any bytes move, and
 * again on completion, which is the moment it is actually claimed.
 */

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) return json({ message: 'No platform bindings.' }, { status: 503 });
	if (!sameOrigin(request)) return json({ message: 'Cross-origin request refused.' }, { status: 403 });

	let body: { name?: unknown; size?: unknown; type?: unknown; slug?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Body must be JSON.' }, { status: 400 });
	}

	const size = Number(body.size);
	if (!Number.isSafeInteger(size) || size <= 0) {
		return json({ fields: { file: 'That file is empty.' } }, { status: 400 });
	}

	const limits = uploadLimits(env.UPLOAD_PART_MIB);
	const partSize = partSizeFor(size, limits);
	if (!partSize) {
		return json(
			{ fields: { file: `Files can be up to ${fmtBytes(limits.maxFileBytes)}.` } },
			{ status: 413 }
		);
	}

	let slug = typeof body.slug === 'string' ? body.slug.trim() : '';
	if (slug) {
		const problem = await slugProblem(env, slug);
		if (problem) return json({ fields: { slug: problem } }, { status: 400 });
	} else {
		slug = (await freeRandomSlug(env)) ?? '';
		if (!slug) return json({ fields: { slug: 'Could not find a free name. Try again.' } }, { status: 409 });
	}

	const type = typeof body.type === 'string' && body.type ? body.type : 'application/octet-stream';
	const upload = await env.BUCKET.createMultipartUpload(fileKey(slug), {
		httpMetadata: { contentType: type }
	});

	return json({ slug, uploadId: upload.uploadId, partSize });
};
