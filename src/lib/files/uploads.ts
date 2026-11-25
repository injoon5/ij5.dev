/**
 * Upload limits for shared files, derived from the platform rather than
 * picked out of the air. Client-safe: the form uses the same numbers the
 * server enforces.
 *
 * A file goes to R2 as a multipart upload, one part per request, each part
 * streamed through the Worker into the bucket. Two ceilings meet here:
 *
 *   - R2: at most 10,000 parts, every part but the last the same size, each
 *     at least 5 MiB, and an object at most 5 TiB − 5 GiB.
 *     https://developers.cloudflare.com/r2/objects/multipart-objects/
 *   - Workers: a request body is capped by the zone's plan — 100 MB on Free
 *     and Pro, 200 MB on Business, up to 5 GB on Enterprise. That caps the
 *     size of one part, and so (× 10,000) the size of a file.
 *     https://developers.cloudflare.com/workers/platform/limits/
 *
 * The part ceiling is the one knob: `UPLOAD_PART_MIB`, defaulting to 90 MiB,
 * which clears Free/Pro's 100 MB with room for headers. Raise it to match a
 * bigger plan and the file limit follows, up to R2's own.
 */

const MiB = 1024 * 1024;

/** R2's smallest allowed part (every part but the last). */
export const MIN_PART_BYTES = 5 * MiB;

/** R2's most parts per upload. */
export const MAX_PARTS = 10_000;

/** R2's largest object: 5 TiB less 5 GiB. */
export const MAX_OBJECT_BYTES = 5 * 1024 ** 4 - 5 * 1024 ** 3;

/** The default part ceiling, for a Free or Pro zone. */
export const DEFAULT_PART_MIB = 90;

/** Parts are never smaller than this unless the whole file is: fewer round
 *  trips, and each still small enough to retry cheaply. */
const PREFERRED_PART_BYTES = 16 * MiB;

export type UploadLimits = {
	/** The largest part one request may carry. */
	maxPartBytes: number;
	/** The largest file the form will accept. */
	maxFileBytes: number;
};

export function uploadLimits(partMib: string | number | undefined = DEFAULT_PART_MIB): UploadLimits {
	const parsed = Number(partMib);
	const mib = Number.isFinite(parsed) && parsed >= 5 ? Math.floor(parsed) : DEFAULT_PART_MIB;
	// R2's own ceiling on one part is 5 GiB.
	const maxPartBytes = Math.min(mib * MiB, 5 * 1024 * MiB);
	return {
		maxPartBytes,
		maxFileBytes: Math.min(maxPartBytes * MAX_PARTS, MAX_OBJECT_BYTES)
	};
}

/**
 * The part size for a file of `size` bytes: the preferred size, grown just
 * enough (in whole MiB) that the file fits in 10,000 parts. `null` when it
 * cannot fit at all.
 */
export function partSizeFor(size: number, limits: UploadLimits): number | null {
	if (size > limits.maxFileBytes) return null;
	const needed = Math.ceil(size / MAX_PARTS / MiB) * MiB;
	return Math.min(Math.max(PREFERRED_PART_BYTES, needed, MIN_PART_BYTES), limits.maxPartBytes);
}
