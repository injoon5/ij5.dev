/** Big enough for logs, small enough that a browser renders it in one `<pre>`. */
export const MAX_PASTE_CHARS = 250_000;

/** Plain text served at `/p/{slug}` (rendered) and `/raw/{slug}` (as is). */
export type PasteRow = {
	slug: string;
	body: string;
	note: string | null;
	created_at: number;
	expires_at: number | null;
	/** Whether views may sit in the edge cache for `PASTE_TTL` seconds. */
	cache: boolean;
};

export type PasteInput = Omit<PasteRow, 'created_at'>;

/** How long a cached paste's views are served from the edge cache. */
export const PASTE_TTL = 300;
