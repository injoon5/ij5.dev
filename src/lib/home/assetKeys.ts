/**
 * Uploaded images: R2 objects at `img/{hash}.{ext}`, referenced from the
 * homepage document by key. One rule for what a key looks like, shared by the
 * renderer, the image-size lookup, the cleanup that deletes unreferenced
 * images, and the upload endpoint that mints them.
 */

export const IMAGE_FORMATS = [
	{ mime: 'image/png', ext: 'png' },
	{ mime: 'image/jpeg', ext: 'jpg' },
	{ mime: 'image/webp', ext: 'webp' },
	{ mime: 'image/avif', ext: 'avif' }
] as const;

export type ImageMime = (typeof IMAGE_FORMATS)[number]['mime'];

/** For `<input type="file" accept>`. */
export const IMAGE_ACCEPT = IMAGE_FORMATS.map((f) => f.mime).join(',');

// Never ends in a dot, so "see img/a1b2.png." in prose names `img/a1b2.png`.
const KEY = String.raw`img\/[\w.-]*[\w-]`;
const EXACT = new RegExp(`^${KEY}$`);

export const isAssetKey = (v: unknown): v is string => typeof v === 'string' && EXACT.test(v);

/** Every asset key a document mentions. */
export function imageKeysIn(src: string | null | undefined): string[] {
	return [...new Set((src ?? '').match(new RegExp(KEY, 'g')) ?? [])];
}
