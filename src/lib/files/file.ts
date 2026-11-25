/** The largest file the no-JavaScript form post accepts. That path buffers the
 * whole form in the Worker (128 MB of memory, shared), so it stays small; the
 * normal path streams the file to R2 in parts and is limited only by
 * `$lib/uploads`. */
export const MAX_FORM_FILE_BYTES = 25 * 1024 * 1024;

/** A shared file — bytes in R2, this row as its catalog entry. */
export type FileRow = {
	slug: string;
	/** R2 object key (`dl/{slug}`). */
	key: string;
	/** Original filename, for display and `Content-Disposition`. */
	name: string;
	mime: string;
	bytes: number;
	created_at: number;
	expires_at: number | null;
	/** Incremented on every served download. */
	downloads: number;
};
