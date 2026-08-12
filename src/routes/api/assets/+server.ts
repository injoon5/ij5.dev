import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Binary upload (§5). The one place a `+server.ts` endpoint beats a form
 * action, because the body is binary rather than form-encoded.
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
const SIGNATURES: Array<{ mime: string; ext: string; test: (b: Uint8Array) => boolean }> = [
	{
		mime: 'image/png',
		ext: 'png',
		test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
	},
	{
		mime: 'image/jpeg',
		ext: 'jpg',
		test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
	},
	{
		mime: 'image/webp',
		ext: 'webp',
		test: (b) =>
			b[0] === 0x52 &&
			b[1] === 0x49 &&
			b[2] === 0x46 &&
			b[3] === 0x46 &&
			b[8] === 0x57 &&
			b[9] === 0x45 &&
			b[10] === 0x42 &&
			b[11] === 0x50
	},
	{
		mime: 'image/avif',
		ext: 'avif',
		// 'ftyp' at offset 4, with an 'avif'/'avis' brand following it.
		test: (b) =>
			b[4] === 0x66 &&
			b[5] === 0x74 &&
			b[6] === 0x79 &&
			b[7] === 0x70 &&
			b[8] === 0x61 &&
			b[9] === 0x76 &&
			b[10] === 0x69 &&
			(b[11] === 0x66 || b[11] === 0x73)
	}
];

const hex = (buffer: ArrayBuffer) =>
	Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) error(500, 'No platform bindings.');

	// SvelteKit's built-in CSRF protection only covers form-encoded POSTs, so a
	// binary upload from another origin would otherwise sail through on the
	// session cookie alone.
	const origin = request.headers.get('origin');
	if (!origin || origin !== new URL(request.url).origin) {
		error(403, 'Cross-origin upload refused.');
	}

	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_BYTES) error(413, 'Images are capped at 5 MB.');

	const body = await request.arrayBuffer();
	if (body.byteLength === 0) error(400, 'Empty upload.');
	if (body.byteLength > MAX_BYTES) error(413, 'Images are capped at 5 MB.');

	const head = new Uint8Array(body.slice(0, 16));
	const format = SIGNATURES.find((s) => s.test(head));
	if (!format) error(415, 'PNG, JPEG, WebP or AVIF only.');

	// Content-addressed: the same image twice dedupes for free, and the key can
	// never go stale, so caching it is unconditional.
	const digest = await crypto.subtle.digest('SHA-256', body);
	const key = `img/${hex(digest).slice(0, 16)}.${format.ext}`;

	const existing = await env.DB.prepare(`SELECT key FROM assets WHERE key = ?`).bind(key).first();
	if (existing) {
		return json({ key, url: `${env.ASSETS_ORIGIN}/${key}`, deduped: true });
	}

	const w = Number(request.headers.get('x-image-width')) || null;
	const h = Number(request.headers.get('x-image-height')) || null;

	// Setting `cacheControl` at upload time makes serving a pure passthrough:
	// the bucket's custom domain answers without the Worker ever running.
	await env.BUCKET.put(key, body, {
		httpMetadata: {
			contentType: format.mime,
			cacheControl: 'public, max-age=31536000, immutable'
		}
	});

	await env.DB.prepare(`INSERT INTO assets (key, mime, bytes, w, h, at) VALUES (?, ?, ?, ?, ?, ?)`)
		.bind(key, format.mime, body.byteLength, w, h, Date.now())
		.run();

	return json({ key, url: `${env.ASSETS_ORIGIN}/${key}`, w, h });
};
