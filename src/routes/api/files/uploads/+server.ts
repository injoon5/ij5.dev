import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fileKey } from '$lib/files/files.server';
import { FILE_EMPTY, fileTooBig } from '$lib/files/file';
import { chooseSlug } from '$lib/slugs/slugs.server';
import { sameOrigin } from '$lib/server/origin';
import { fmtBytes } from '$lib/format';
import { partSizeFor, uploadLimits } from '$lib/files/uploads';
import { bindings } from '$lib/server/bindings';

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
	const env = bindings(platform);
	if (!sameOrigin(request)) return json({ message: 'Cross-origin request refused.' }, { status: 403 });

	let body: { name?: unknown; size?: unknown; type?: unknown; slug?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Body must be JSON.' }, { status: 400 });
	}

	const size = Number(body.size);
	if (!Number.isSafeInteger(size) || size <= 0) {
		return json({ fields: { file: FILE_EMPTY } }, { status: 400 });
	}

	const limits = uploadLimits(env.UPLOAD_PART_MIB);
	const partSize = partSizeFor(size, limits);
	if (!partSize) {
		return json({ fields: { file: fileTooBig(fmtBytes(limits.maxFileBytes)) } }, { status: 413 });
	}

	const chosen = await chooseSlug(env, typeof body.slug === 'string' ? body.slug : '');
	if (!chosen.ok) return json({ fields: { slug: chosen.problem } }, { status: 400 });
	const slug = chosen.slug;

	const type = typeof body.type === 'string' && body.type ? body.type : 'application/octet-stream';
	const upload = await env.BUCKET.createMultipartUpload(fileKey(slug), {
		httpMetadata: { contentType: type }
	});

	return json({ slug, uploadId: upload.uploadId, partSize });
};
