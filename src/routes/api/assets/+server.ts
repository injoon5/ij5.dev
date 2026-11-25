import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bindings } from '$lib/server/bindings';
import { IMAGE_FORMATS, type ImageMime } from '$lib/home/assetKeys';
import { storeAsset } from '$lib/home/assets.server';

/**
 * Image upload: an endpoint rather than a form action, because the body is
 * binary rather than form-encoded.
 *
 * Small files, admin-only, low volume: no presigning, no multipart, no
 * versioning. The session check happens in the hook, which guards everything
 * under `/api`.
 */

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Magic bytes, not `Content-Type`. A client can claim anything, and the whole
 * point of sniffing is to not take its word for it.
 *
 * No SVG: it can carry scripts, and the bucket domain has no CSP of its own.
 * Not worth the exception.
 */
const SIGNATURES: Record<ImageMime, (b: Uint8Array) => boolean> = {
	'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
	'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	// 'RIFF' … 'WEBP'
	'image/webp': (b) =>
		b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
		b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
	// 'ftyp' at offset 4, then an 'avif' or 'avis' brand.
	'image/avif': (b) =>
		b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 &&
		b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && (b[11] === 0x66 || b[11] === 0x73)
};

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = bindings(platform);


	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_BYTES) error(413, 'Images are capped at 5 MB.');

	const body = await request.arrayBuffer();
	if (body.byteLength === 0) error(400, 'Empty upload.');
	if (body.byteLength > MAX_BYTES) error(413, 'Images are capped at 5 MB.');

	const head = new Uint8Array(body.slice(0, 16));
	const format = IMAGE_FORMATS.find((f) => SIGNATURES[f.mime](head));
	if (!format) error(415, 'PNG, JPEG, WebP or AVIF only.');

	const w = Number(request.headers.get('x-image-width')) || null;
	const h = Number(request.headers.get('x-image-height')) || null;
	const { key, deduped } = await storeAsset(env, body, format, { w, h });
	if (deduped) return json({ key, url: `${env.ASSETS_ORIGIN}/${key}`, deduped });

	return json({ key, url: `${env.ASSETS_ORIGIN}/${key}`, w, h });
};
