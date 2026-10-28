/**
 * Client-side image upload, shared by the avatar picker and the Markdown
 * editor's "insert image".
 *
 * Downscale and re-encode before the upload rather than after it. R2 serves
 * originals and Cloudflare's image resizing is not free, so the work belongs on
 * the client — where CPU is unmetered — not on a Worker with a tight budget.
 */

export const MAX_EDGE = 1600;

export async function shrink(file: File): Promise<{ blob: Blob; w: number; h: number }> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const w = Math.round(bitmap.width * scale);
	const h = Math.round(bitmap.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is unavailable.');
	ctx.drawImage(bitmap, 0, 0, w, h);
	bitmap.close();

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/webp', 0.82)
	);
	if (!blob) throw new Error('That image could not be re-encoded.');
	return { blob, w, h };
}

/** Uploads an image and returns the content-addressed key R2 stored it under. */
export async function uploadImage(
	file: File
): Promise<{ key: string; w: number; h: number; mime: string; bytes: number }> {
	if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
	const { blob, w, h } = await shrink(file);
	const res = await fetch('/api/assets', {
		method: 'POST',
		headers: {
			// Without this SvelteKit answers a thrown `error()` with its HTML
			// error page, and the whole document became the message on screen.
			accept: 'application/json',
			'content-type': blob.type,
			'x-image-width': String(w),
			'x-image-height': String(h)
		},
		body: blob
	});
	if (!res.ok) throw new Error(await errorMessage(res, 'That image could not be uploaded.'));
	const json = (await res.json()) as { key: string };
	return { key: json.key, w, h, mime: blob.type, bytes: blob.size };
}

/** The sentence a failed JSON endpoint sent back: SvelteKit's `error()` writes
 *  `message`, the API helpers write `error`. The hook's bare-text 401 means the
 *  session lapsed while the page sat open. Anything else gets the fallback. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.json()) as { message?: string; error?: string };
		if (body.message || body.error) return (body.message || body.error) as string;
	} catch {
		// Not JSON.
	}
	return res.status === 401 ? 'Your session has expired. Sign in again.' : fallback;
}
